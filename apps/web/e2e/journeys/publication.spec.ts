// Assistant de campagne, étapes Aperçu et Publier (APPFLOW §8.5 et §8.6) : parcours P2 réel contre la pile locale, la FAUSSE IA et la
// FAUSSE Meta (PUBEKA_FAKE_PROVIDERS) : AUCUNE publicité réelle n'est créée. Sans défilement horizontal (TR-PLT-01), accessible (axe),
// clair et sombre. Les erreurs qu'on ne peut pas provoquer avec la fausse Meta sont simulées côté navigateur (réponses du serveur).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  connectFakeMeta,
  createConfirmedUser,
  ensureTestRate,
  overflowsHorizontally,
  patchMe,
  signIn,
} from './support';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function checkScreen(
  page: Page,
  name: string,
  info: { project: { name: string } },
  theme: string,
) {
  expect(await overflowsHorizontally(page)).toBe(false);
  // Les montants en FCFA viennent d'un taux d'ESSAI posé par les tests : le nom du fichier le dit.
  await page.screenshot({
    path: `../../test-results/captures/${name}-valeurs-essai-${info.project.name}-${theme}.png`,
    fullPage: true,
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
    [],
  );
}

/** Compte relié à la fausse Meta, wizard jusqu'à la proposition retenue : l'écran Aperçu s'ouvre. */
async function reachPreview(
  page: Page,
  theme: 'light' | 'dark',
  options: { payment?: boolean } = {},
) {
  await ensureTestRate();
  const user = await createConfirmedUser('Awa');
  await signIn(page, user);
  await patchMe(page, { theme, ui_language: 'fr' });
  await connectFakeMeta(page, user, options);
  await page.goto('/campagnes/nouvelle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // La Page active de l'espace relié est choisie d'office : on attend que la liste soit chargée avant d'analyser.
  await expect(page.getByLabel('Page', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Photo du produit/ }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'produit.png', mimeType: 'image/png', buffer: PNG_1X1 });
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
  await page.getByRole('button', { name: 'Générer la proposition' }).click();
  await expect(page.getByText('Coût estimé')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aperçu de ta pub' })).toBeVisible({
    timeout: 20_000,
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`P2 : aperçu des cinq emplacements, récapitulatif, clause, publication, succès (${theme})`, async ({
    page,
  }, info) => {
    await reachPreview(page, theme);

    // Aperçu : les cinq emplacements, un onglet à la fois ; jamais de TVA ; lien d'attribution sous le montant converti.
    await expect(page.getByRole('tab')).toHaveCount(5);
    await expect(page.getByText(/Aperçu construit par Pubeka/)).toBeVisible();
    await expect(page.getByText(/TVA/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Exchange Rate API/ }).first()).toBeVisible();
    await checkScreen(page, 'apercu-fil-facebook', info, theme);
    for (const [name, capture] of [
      ['Fil Instagram', 'apercu-fil-instagram'],
      ['Stories', 'apercu-stories'],
      ['Reels', 'apercu-reels'],
      ['Messenger', 'apercu-messenger'],
    ] as const) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      if (name === 'Stories') {
        // « Créer le format 9:16 » : un état seulement, rien ne se construit ici.
        await expect(page.getByRole('button', { name: 'Créer le format 9:16' })).toBeDisabled();
      }
      await checkScreen(page, capture, info, theme);
    }

    // Publier : vérification finale, puis la clause de responsabilité (première publication).
    await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Publier ta campagne' }),
    ).toBeVisible();
    await expect(page.getByText(/fonds Meta Ads/).first()).toBeVisible();
    await checkScreen(page, 'publier-verification', info, theme);
    await page.getByRole('button', { name: 'Publier la campagne' }).click();
    await expect(page.getByText('Avant ta première publication')).toBeVisible();
    await checkScreen(page, 'publier-clause', info, theme);
    await page.getByRole('button', { name: 'J’ai compris' }).click();

    // La fausse Meta accepte : la campagne arrive chez Meta, l'écran de succès s'affiche avec le montant converti et son lien.
    await expect(page.getByText('Ta campagne est envoyée à Meta')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Voir ma campagne' })).toBeVisible();
    await expect(page.getByText(/TVA/)).toHaveCount(0);
    await checkScreen(page, 'publier-succes', info, theme);

    // Un rechargement retrouve le succès (tout est sur le serveur) et ne republie rien.
    await page.reload();
    await expect(page.getByText('Ta campagne est envoyée à Meta')).toBeVisible();
  });

  test(`sans moyen de paiement : le guide des fonds Meta Ads (carte bancaire, Keecash), brouillon gardé (${theme})`, async ({
    page,
  }, info) => {
    await reachPreview(page, theme, { payment: false });
    await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
    await expect(page.getByText('Absent : Meta ne diffusera pas ta pub.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier la campagne' })).toBeDisabled();
    await checkScreen(page, 'publier-sans-moyen-de-paiement', info, theme);
    await page.getByRole('button', { name: 'Voir le guide' }).first().click();
    const guide = page.getByRole('dialog');
    await expect(guide.getByText(/carte bancaire/).first()).toBeVisible();
    await expect(guide.getByText(/Keecash/).first()).toBeVisible();
    await checkScreen(page, 'publier-guide-fonds-meta', info, theme);
  });
}

/** Réponses du serveur simulées pour la publication (états que la fausse Meta ne produit pas). */
async function simulatePublish(
  page: Page,
  reply: { status: number; body: Record<string, unknown> } | 'long',
) {
  await page.addInitScript((r) => {
    const original = window.fetch.bind(window);
    const isPublish = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return init?.method === 'POST' && /\/campaigns\/[^/]+\/publish$/.test(url);
    };
    const isCampaignGet = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return (init?.method ?? 'GET') === 'GET' && /\/campaigns\/[^/]+$/.test(url);
    };
    let publishing: Record<string, unknown> | null = null;
    window.fetch = async (input, init) => {
      if (isPublish(input, init)) {
        if (r === 'long') {
          const real = await original(input, init);
          const body = (await real.clone().json()) as Record<string, unknown>;
          publishing = { ...body, status: 'publishing' };
          return real;
        }
        return new Response(
          JSON.stringify({
            type: 'x',
            title: 'x',
            request_id: 'req_E2E',
            ...r.body,
            status: r.status,
          }),
          {
            status: r.status,
            headers: { 'content-type': 'application/problem+json' },
          },
        );
      }
      if (publishing !== null && isCampaignGet(input, init)) {
        // La publication « dure » : la campagne reste « en publication » (l'écran dit « on vérifie » après 45 s).
        return new Response(JSON.stringify(publishing), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return original(input, init);
    };
  }, reply);
}

const ERRORS: {
  name: string;
  capture: string;
  status: number;
  body: Record<string, unknown>;
  text: string | RegExp;
}[] = [
  {
    name: 'aucun moyen de paiement',
    capture: 'publier-erreur-moyen-de-paiement',
    status: 424,
    body: { code: 'meta_payment_method_missing' },
    text: 'Ton compte publicitaire n’a pas de moyen de paiement.',
  },
  {
    name: 'jeton expiré',
    capture: 'publier-erreur-jeton-expire',
    status: 424,
    body: { code: 'meta_token_expired' },
    text: 'Reconnecte ton compte Meta.',
  },
  {
    name: 'quota atteint',
    capture: 'publier-erreur-quota',
    status: 402,
    body: { code: 'campaign_quota_reached', meta: { upgrade_to: 'business' } },
    text: 'Tu as publié toutes les campagnes de ta formule.',
  },
  {
    name: 'Page hors formule',
    capture: 'publier-erreur-page-hors-formule',
    status: 402,
    body: { code: 'page_limit_reached', meta: { available_from: '2026-11-01T00:00:00.000Z' } },
    text: /Elle sera utilisable à partir du 1 novembre/,
  },
  {
    name: 'champs à corriger',
    capture: 'publier-erreur-champs',
    status: 400,
    body: {
      code: 'validation_failed',
      errors: [
        {
          field: 'copy.headline',
          code: 'required',
          message: 'Le titre de la pub est obligatoire.',
        },
      ],
    },
    text: 'Le titre de la pub est obligatoire.',
  },
  {
    name: 'taux de change changé',
    capture: 'publier-erreur-taux-change',
    status: 409,
    body: {
      code: 'conflict',
      meta: {
        reason: 'fx_changed',
        new_total: { amount_minor: 17400, currency: 'XAF', usd_cents: 2900 },
      },
    },
    text: 'Le taux de change a bougé.',
  },
  {
    name: 'erreur connue de Meta',
    capture: 'publier-erreur-meta-connue',
    status: 502,
    body: {
      code: 'meta_error',
      meta: {
        title: 'Publicité incompatible avec la destination choisie',
        message: 'Choisis une destination de messagerie ou passe en destination « Site Web ».',
      },
    },
    text: 'Publicité incompatible avec la destination choisie',
  },
  {
    name: 'erreur inconnue',
    capture: 'publier-erreur-inconnue',
    status: 500,
    body: { code: 'internal_error' },
    text: 'La publication a échoué.',
  },
];

for (const theme of ['light', 'dark'] as const) {
  for (const error of ERRORS) {
    test(`erreur de publication « ${error.name} » : message clair, brouillon, aucun code technique (${theme})`, async ({
      page,
    }, info) => {
      await simulatePublish(page, { status: error.status, body: error.body });
      await reachPreview(page, theme);
      await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
      await page.getByRole('button', { name: 'Publier la campagne' }).click();
      await page.getByRole('button', { name: 'J’ai compris' }).click();
      const alert = page.getByRole('alert').filter({ hasText: error.text });
      await expect(alert).toBeVisible({ timeout: 20_000 });
      await expect(alert).not.toContainText(/meta_|_error|req_E2E|\b[45]\d\d\b/);
      await checkScreen(page, error.capture, info, theme);
    });
  }

  test(`publication longue : l'écran dit « on vérifie » et ne propose pas de republier (${theme})`, async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await simulatePublish(page, 'long');
    await reachPreview(page, theme);
    await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
    await page.getByRole('button', { name: 'Publier la campagne' }).click();
    await page.getByRole('button', { name: 'J’ai compris' }).click();
    await expect(page.getByText('Publication en cours…')).toBeVisible({ timeout: 20_000 });
    await checkScreen(page, 'publier-en-cours', info, theme);
    await expect(page.getByText('On vérifie')).toBeVisible({ timeout: 70_000 });
    await expect(page.getByRole('button', { name: 'Publier la campagne' })).toHaveCount(0);
    await checkScreen(page, 'publier-on-verifie', info, theme);
  });
}
