// Assistant de campagne, étapes Sources et Questions (APPFLOW §8.0 à §8.2) : parcours réel contre la pile locale et la FAUSSE IA
// (PUBEKA_FAKE_PROVIDERS), sans défilement horizontal (TR-PLT-01), accessible (axe), clair et sombre, FR et EN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createConfirmedUser,
  overflowsHorizontally,
  patchMe,
  signIn,
  type TestUser,
} from './support';

let user: TestUser;
test.beforeAll(async () => {
  user = await createConfirmedUser('Awa');
});

// PNG de 1 × 1 pixel : une vraie image, pour la vraie chaîne d'envoi (URL signée, vérification, ré-encodage).
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
  await page.screenshot({
    path: `../../test-results/captures/${name}-${info.project.name}-${theme}.png`,
    fullPage: true,
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
    [],
  );
}

async function open(page: Page, theme: 'light' | 'dark', language: 'fr' | 'en' = 'fr') {
  await signIn(page, user);
  await patchMe(page, { theme, ui_language: language });
  await page.goto('/campagnes/nouvelle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const theme of ['light', 'dark'] as const) {
  test(`étape Sources : sans défilement horizontal, axe, captures (${theme})`, async ({
    page,
  }, info) => {
    await open(page, theme);
    await expect(
      page.getByRole('heading', { level: 1, name: /Qu’as-tu sous la main/ }),
    ).toBeVisible();
    // APPFLOW §8.0 : Meta non connecté, on peut quand même préparer la campagne.
    await expect(page.getByText('Connecte ton compte Meta pour publier.')).toBeVisible();
    await checkScreen(page, 'wizard-sources-vide', info, theme);
    await page.getByRole('button', { name: 'Préparer sans publier' }).click();
    for (const name of [
      /Lien de site/,
      /Photo du produit/,
      /Publication/,
      /Document/,
      /Description/,
    ]) {
      await page.getByRole('button', { name }).click();
    }
    await page.getByLabel('Lien de ton site').fill('https://boutique-awa.example.cm');
    await page
      .getByLabel('Décris ton activité')
      .fill('Je vends des baskets Nike à Abidjan, à partir de 25 000 F.');
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: 'produit.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await checkScreen(page, 'wizard-sources-rempli', info, theme);
  });

  test(`parcours : décrire son activité, analyser, répondre aux questions (${theme})`, async ({
    page,
  }, info) => {
    await open(page, theme);
    await page.getByRole('button', { name: 'Préparer sans publier' }).click();
    await page.getByRole('button', { name: /Description/ }).click();
    await page
      .getByLabel('Décris ton activité')
      .fill('Je vends des baskets Nike à Abidjan Cocody, à partir de 25 000 F. Livraison en 24 h.');
    await page.getByRole('button', { name: 'Analyser' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Quelques précisions' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/analyse=/);
    await checkScreen(page, 'wizard-questions', info, theme);

    // Validation avant envoi : une réponse obligatoire vide ou un numéro sans indicatif.
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByText('Cette réponse est nécessaire.').first()).toBeVisible();
    await page.getByRole('textbox').first().fill('0690123456');
    await expect(page.getByText(/Écris le numéro avec l’indicatif du pays/)).toBeVisible();
    await checkScreen(page, 'wizard-questions-erreurs', info, theme);

    await page.getByRole('textbox').nth(0).fill('+237 690 12 34 56');
    await page.getByRole('textbox').nth(1).fill('Douala');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByText('Tes réponses sont enregistrées.')).toBeVisible();
    await checkScreen(page, 'wizard-reponses-enregistrees', info, theme);

    // Un rechargement retrouve l'étape et les réponses (l'analyse est dans l'adresse).
    await page.reload();
    await expect(page.getByText('Tes réponses sont enregistrées.')).toBeVisible();
    await page.getByRole('button', { name: 'Modifier mes réponses' }).click();
    await expect(page.getByRole('textbox').first()).toHaveValue('+237690123456');
  });
}

test('TR-SEC-08 : une photo envoyée par URL signée est vérifiée, puis l’analyse aboutit', async ({
  page,
}) => {
  await open(page, 'light');
  await page.getByRole('button', { name: /Photo du produit/ }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'produit.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Quelques précisions' })).toBeVisible({
    timeout: 30_000,
  });
});

test('TR-SEC-08 : un fichier trop lourd ou d’un mauvais format est refusé à l’écran', async ({
  page,
}, info) => {
  await open(page, 'light');
  await page.getByRole('button', { name: /Photo du produit/ }).click();
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'enorme.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
    { name: 'anime.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
  ]);
  await expect(page.getByText('Ce fichier dépasse 10 Mo.')).toBeVisible();
  await expect(page.getByText('Formats acceptés : JPG, PNG, WEBP, PDF, DOCX.')).toBeVisible();
  await checkScreen(page, 'wizard-fichiers-refuses', info, 'light');
});

test('EC-SRC-01 : une adresse interne est refusée par le serveur avec un message clair', async ({
  page,
}) => {
  await open(page, 'light');
  await page.getByRole('button', { name: /Lien de site/ }).click();
  await page.getByLabel('Lien de ton site').fill('http://169.254.169.254/latest/meta-data/');
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByText('Ce lien ne peut pas être lu.')).toBeVisible();
});

const ID = '99999999-9999-4999-8999-999999999999';
const states: {
  name: string;
  status: string;
  body: Record<string, unknown>;
  heading: RegExp | string;
}[] = [
  { name: 'attente', status: 'analysing', body: {}, heading: 'Je lis tes sources…' },
  {
    name: 'produit-illegal',
    status: 'blocked',
    body: { blocked_reason: 'illegal_product' },
    heading: 'Pubeka ne peut pas créer de publicité pour ce produit.',
  },
  {
    name: 'echec-illisible',
    status: 'failed',
    body: { error_code: 'source_unreadable' },
    heading: 'L’analyse n’a pas abouti.',
  },
  {
    name: 'echec-photos',
    status: 'failed',
    body: { error_code: 'provider_unavailable', flags: ['MODEL_WITHOUT_VISION'] },
    heading: 'L’analyse n’a pas abouti.',
  },
];
for (const state of states) {
  for (const theme of ['light', 'dark'] as const) {
    test(`état « ${state.name} » : sans défilement horizontal et axe (${theme})`, async ({
      page,
    }, info) => {
      await open(page, theme);
      await page.route('**/api/v1/workspaces/*/analyses/*', (route) =>
        route.fulfill({
          json: {
            id: ID,
            status: state.status,
            questions: [],
            unreadable_sources: [],
            flags: [],
            answers: [],
            ...state.body,
          },
        }),
      );
      await page.goto(`/campagnes/nouvelle?analyse=${ID}`);
      await expect(page.getByRole('heading', { level: 1, name: state.heading })).toBeVisible();
      await checkScreen(page, `wizard-${state.name}`, info, theme);
    });
  }
}

test('TR-PLT-03 : en anglais, l’assistant n’affiche aucun libellé français', async ({
  page,
}, info) => {
  await open(page, 'light', 'en');
  await expect(
    page.getByRole('heading', { level: 1, name: 'What do you have at hand?' }),
  ).toBeVisible();
  const text = await page.locator('main, body').first().innerText();
  for (const french of ['Qu’as-tu', 'Analyser', 'Sources', 'Bientôt', 'facultatif']) {
    if (french === 'Sources') continue; // même mot dans les deux langues
    expect(text).not.toContain(french);
  }
  await checkScreen(page, 'wizard-sources-en', info, 'light');
});
