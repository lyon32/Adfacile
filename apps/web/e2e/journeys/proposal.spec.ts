// Assistant de campagne, étape Proposition (APPFLOW §8.3) : parcours réel contre la pile locale et la FAUSSE IA, sans défilement
// horizontal (TR-PLT-01), accessible (axe), clair et sombre, FR. Les états qu'on ne peut pas obtenir de la fausse IA
// (écriture en cours, erreur au milieu du flux, taux de change, conflit de version) sont simulés côté navigateur.
import { expect, test, type Page } from '@playwright/test';
import { createConfirmedUser, overflowsHorizontally, patchMe, signIn, axeAnalyze } from './support';

// Un compte neuf par test : la limite « IA » (20 par heure et par espace) ne doit pas fausser un parcours.

// Écrans SANS montant : les autres affichent des FCFA calculés avec le taux de change d'ESSAI posés par les tests (pas des
// données du produit) ; leurs captures le disent dans le nom du fichier.
const SANS_MONTANT = new Set([
  'proposition-depart',
  'proposition-ecriture',
  'proposition-erreur-flux',
]);

async function checkScreen(
  page: Page,
  name: string,
  info: { project: { name: string } },
  theme: string,
) {
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({
    path: `../../test-results/captures/${name}${SANS_MONTANT.has(name) ? '' : '-valeurs-essai'}-${info.project.name}-${theme}.png`,
    fullPage: true,
  });
  const results = await axeAnalyze(page);
  expect(results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
    [],
  );
}

/** Sources → Questions → « Continuer vers la proposition » : l'écran de départ de l'étape Proposition. */
async function reachProposalStart(
  page: Page,
  theme: 'light' | 'dark',
  language: 'fr' | 'en' = 'fr',
) {
  const user = await createConfirmedUser('Awa');
  await signIn(page, user);
  await patchMe(page, { theme, ui_language: language });
  await page.goto('/campagnes/nouvelle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.getByRole('button', { name: 'Préparer sans publier' }).click();
  await page.getByRole('button', { name: /Description/ }).click();
  await page
    .getByLabel('Décris ton activité')
    .fill('Je vends des baskets Nike à Abidjan Cocody, à partir de 25 000 F. Livraison en 24 h.');
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Quelques précisions' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('textbox').nth(0).fill('+237 690 12 34 56');
  await page.getByRole('textbox').nth(1).fill('Douala');
  await page.getByRole('button', { name: 'Générer la proposition' }).click();
  await expect(page.getByText('Tes réponses sont enregistrées.')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer vers la proposition' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ta proposition de campagne' }),
  ).toBeVisible();
}

async function generate(page: Page) {
  await page.getByRole('button', { name: 'Générer la proposition' }).click();
  await expect(page.getByText('Coût estimé')).toBeVisible({ timeout: 30_000 });
}

for (const theme of ['light', 'dark'] as const) {
  test(`proposition : départ, écriture, fiche et coût, modification, rechargement (${theme})`, async ({
    page,
  }, info) => {
    await reachProposalStart(page, theme);
    await checkScreen(page, 'proposition-depart', info, theme);

    await generate(page);
    await expect(page).toHaveURL(/campagne=/);
    await expect(page.getByText('Messages ou interactions')).toBeVisible();
    // Pas de Meta connecté : WhatsApp n'est pas lié, la proposition passe par Messenger avec un avertissement.
    await expect(page.getByText('Messenger', { exact: true })).toBeVisible();
    await expect(page.getByText(/WhatsApp non lié/)).toBeVisible();
    // Taux de change du pays indisponible (aucune donnée n'est inventée) : le message est clair et le dollar seul s'affiche ;
    // sinon le coût total est là. Jamais de TVA (retirée le 17/10/2026).
    const noFx = page.getByText(/taux de change n’est pas disponible/);
    const total = page.getByText('Coût total');
    await expect(noFx.or(total)).toBeVisible();
    await expect(page.getByText(/TVA/)).toHaveCount(0);
    await checkScreen(page, 'proposition-complete', info, theme);

    // [Modifier] : formulaire, erreurs champ par champ, puis enregistrement.
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Modifier la proposition' })).toBeVisible();
    await checkScreen(page, 'proposition-modifier', info, theme);
    await page.getByLabel('Titre', { exact: true }).fill('');
    await page.getByLabel('Budget par jour').fill('0.5');
    await page.getByRole('button', { name: 'Enregistrer mes modifications' }).click();
    await expect(page.getByText('Le titre est nécessaire.')).toBeVisible();
    await expect(page.getByText('Le budget minimum est de 1 $ par jour.')).toBeVisible();
    await checkScreen(page, 'proposition-modifier-erreurs', info, theme);
    await page.getByLabel('Titre', { exact: true }).fill('Livraison rapide à Douala');
    await page.getByLabel('Budget par jour').fill('5');
    await page.getByRole('button', { name: 'Enregistrer mes modifications' }).click();
    await expect(page.getByText('Livraison rapide à Douala')).toBeVisible();
    await expect(page.getByText('Retenue').first()).toBeVisible();
    await checkScreen(page, 'proposition-modifiee', info, theme);

    // Un rechargement retrouve la campagne et la proposition (tout est dans l'adresse et sur le serveur).
    await page.reload();
    await expect(page.getByText('Livraison rapide à Douala')).toBeVisible();
  });

  test(`autre proposition : onglets Proposition 1 et 2 (${theme})`, async ({ page }, info) => {
    await reachProposalStart(page, theme);
    await generate(page);
    await page.getByRole('button', { name: 'Autre proposition' }).click();
    await expect(page.getByRole('tab', { name: /Proposition 2/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: /Proposition 1/ })).toBeVisible();
    await checkScreen(page, 'proposition-onglets', info, theme);
    await page.getByRole('tab', { name: /Proposition 1/ }).click();
    await expect(page.getByRole('tab', { name: /Proposition 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
}

/** Remplace `fetch` pour la génération : un flux piloté (aperçu non contractuel), comme le ferait le serveur. */
async function simulateStream(page: Page, script: 'ecriture' | 'erreur') {
  await page.addInitScript((mode) => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!(init?.method === 'POST' && /\/campaigns\/[^/]+\/proposals$/.test(url)))
        return original(input, init);
      const enc = new TextEncoder();
      const ev = (name: string, data: unknown) =>
        enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(ev('field', { path: 'objective', value: 'OUTCOME_ENGAGEMENT' }));
          controller.enqueue(
            ev('field', {
              path: 'objective_reason',
              value: 'Vos clients peuvent vous écrire directement.',
            }),
          );
          controller.enqueue(ev('field', { path: 'destination', value: 'MESSENGER' }));
          controller.enqueue(ev('field', { path: 'budget.daily_usd_cents', value: 400 }));
          if (mode === 'erreur') {
            setTimeout(() => {
              controller.enqueue(
                ev('error', {
                  type: 'x',
                  title: 'x',
                  status: 503,
                  code: 'provider_unavailable',
                  request_id: 'req_E2E',
                }),
              );
              controller.close();
            }, 1500);
          }
          // mode « ecriture » : le flux reste ouvert (la page montre l'écriture en cours).
        },
      });
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );
    };
  }, script);
}

for (const theme of ['light', 'dark'] as const) {
  test(`état « écriture en cours » : champs qui se remplissent, axe, captures (${theme})`, async ({
    page,
  }, info) => {
    await simulateStream(page, 'ecriture');
    await reachProposalStart(page, theme);
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByText('J’écris ta proposition…')).toBeVisible();
    await expect(page.getByText('Messages ou interactions')).toBeVisible();
    await expect(page.getByText('Aperçu : la proposition n’est définitive')).toBeVisible();
    await checkScreen(page, 'proposition-ecriture', info, theme);
  });

  test(`état « erreur au milieu du flux » : message clair, [Réessayer] (${theme})`, async ({
    page,
  }, info) => {
    await simulateStream(page, 'erreur');
    await reachProposalStart(page, theme);
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'La proposition' })).toContainText(
      'La proposition n’a pas pu être écrite',
      {
        timeout: 15_000,
      },
    );
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await checkScreen(page, 'proposition-erreur-flux', info, theme);
  });

  test(`états du coût : FCFA, naira, taux de change indisponible (${theme})`, async ({
    page,
  }, info) => {
    await reachProposalStart(page, theme);
    const listed = page.waitForResponse(
      async (r) =>
        r.request().method() === 'GET' &&
        r.url().includes('/campaigns/') &&
        r.url().endsWith('/proposals') &&
        r.ok() &&
        ((await r.json()) as { data: unknown[] }).data.length > 0,
    );
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByText('Coût estimé')).toBeVisible({ timeout: 30_000 });
    const real = (await (await listed).json()) as { data: Record<string, unknown>[] };
    // Taux d'ESSAI (600 FCFA, 1 500 NGN par dollar) : valeurs de test, pas des données du produit.
    const cost = (status: 'ok' | 'naira' | 'fx_not_available') =>
      status === 'ok'
        ? {
            status: 'ok',
            days: 7,
            budget_usd_cents: 2800,
            total: { local_minor: 16800, usd_cents: 2800, currency: 'XAF' },
            daily: { local_minor: 2400, usd_cents: 400, currency: 'XAF' },
            fx: { rate: 600, quote: 'XAF' },
          }
        : status === 'naira'
          ? {
              status: 'ok',
              days: 7,
              budget_usd_cents: 2800,
              total: { local_minor: 4_200_000, usd_cents: 2800, currency: 'NGN' },
              daily: { local_minor: 600_000, usd_cents: 400, currency: 'NGN' },
              fx: { rate: 1500, quote: 'NGN', source: 'exchangerate-api' },
            }
          : {
              status: 'fx_not_available',
              days: 7,
              budget_usd_cents: 2800,
              total: null,
              daily: null,
              fx: null,
            };
    for (const status of ['ok', 'naira', 'fx_not_available'] as const) {
      await page.route('**/api/v1/workspaces/*/campaigns/*/proposals', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        return route.fulfill({
          json: { data: real.data.map((p) => ({ ...p, cost: cost(status) })) },
        });
      });
      await page.reload();
      await expect(
        page.getByText(
          status === 'fx_not_available' ? /taux de change n’est pas disponible/ : 'Coût total',
        ),
      ).toBeVisible();
      if (status === 'naira') await expect(page.getByText(/42\s?000,00\s?NGN/)).toBeVisible();
      if (status === 'naira')
        await expect(
          page.getByRole('link', { name: 'Taux fournis par Exchange Rate API' }),
        ).toBeVisible();
      if (status === 'ok') await expect(page.getByText(/16\s?800\s?FCFA/)).toBeVisible();
      await checkScreen(
        page,
        `proposition-cout-${status === 'ok' ? 'fcfa' : status === 'naira' ? 'naira' : 'sans-change'}`,
        info,
        theme,
      );
      await page.unroute('**/api/v1/workspaces/*/campaigns/*/proposals');
    }
  });

  test(`conflit de version (409) : bandeau et rechargement (${theme})`, async ({ page }, info) => {
    await reachProposalStart(page, theme);
    await generate(page);
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await page.route('**/api/v1/workspaces/*/campaigns/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 409,
            contentType: 'application/problem+json',
            json: {
              type: 'x',
              title: 'conflict',
              status: 409,
              code: 'conflict',
              request_id: 'req_E2E',
              meta: { current_version: 9, reason: 'stale_version' },
            },
          })
        : route.continue(),
    );
    await page.getByLabel('Titre', { exact: true }).fill('Titre modifié ailleurs');
    await page.getByRole('button', { name: 'Enregistrer mes modifications' }).click();
    await expect(page.getByText('Cette campagne a changé ailleurs')).toBeVisible();
    await checkScreen(page, 'proposition-conflit', info, theme);
    await page.getByRole('button', { name: 'Recharger la campagne' }).click();
    await expect(page.getByText('Cette campagne a changé ailleurs')).toHaveCount(0);
  });
}

test('en anglais : l’étape Proposition est traduite', async ({ page }, info) => {
  const user = await createConfirmedUser('Awa');
  await signIn(page, user);
  await patchMe(page, { theme: 'light', ui_language: 'en' });
  await page.goto('/campagnes/nouvelle');
  await page.getByRole('button', { name: 'Prepare without publishing' }).click();
  await page.getByRole('button', { name: /Description/ }).click();
  await page
    .getByLabel('Describe your business')
    .fill('I sell Nike sneakers in Abidjan Cocody, from 25,000 F. Delivery in 24 h.');
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'A few details' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('textbox').nth(0).fill('+237 690 12 34 56');
  await page.getByRole('textbox').nth(1).fill('Douala');
  await page.getByRole('button', { name: 'Generate the proposal' }).click();
  await page.getByRole('button', { name: 'Continue to the proposal' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your campaign proposal' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate the proposal' }).click();
  await expect(page.getByText('Estimated cost')).toBeVisible({ timeout: 30_000 });
  await checkScreen(page, 'proposition-en', info, 'light');
});
