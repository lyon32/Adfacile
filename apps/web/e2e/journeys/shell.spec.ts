// Coque de l'application : sans défilement horizontal (TR-PLT-01), accessible (axe), clair et
// sombre, et bascule de langue sans texte français qui reste (TR-PLT-03).
import { expect, test } from '@playwright/test';
import {
  createConfirmedUser,
  overflowsHorizontally,
  patchMe,
  signIn,
  type TestUser,
  axeAnalyze,
} from './support';

let user: TestUser;

test.beforeAll(async () => {
  user = await createConfirmedUser('Awa');
});

for (const theme of ['light', 'dark'] as const) {
  test(`TR-PLT-01 : l'accueil ne défile pas en largeur et passe axe (${theme})`, async ({
    page,
  }, info) => {
    await signIn(page, user);
    await patchMe(page, { theme, ui_language: 'fr' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Awa');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await overflowsHorizontally(page)).toBe(false);
    await page.screenshot({
      path: `../../test-results/captures/accueil-${info.project.name}-${theme}.png`,
    });
    const results = await axeAnalyze(page);
    expect(
      results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`),
    ).toEqual([]);
  });
}

test('le panneau du compte ne déborde pas et passe axe', async ({ page }, info) => {
  await signIn(page, user);
  await patchMe(page, { theme: 'light', ui_language: 'fr' });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Ouvrir le menu du compte' })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({ path: `../../test-results/captures/compte-${info.project.name}.png` });
  const results = await axeAnalyze(page);
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('TR-PLT-03 : la bascule en anglais ne laisse aucun libellé français', async ({ page }) => {
  await signIn(page, user);
  await patchMe(page, { theme: 'light', ui_language: 'fr' });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Ouvrir le menu du compte' })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('Escape');
  const text = await page.locator('body').innerText();
  expect(text).toContain('Create your first ad');
  for (const french of [
    'Accueil',
    'Campagnes',
    'Réglages',
    'Crée ta première pub',
    'Aucune Page',
  ]) {
    expect(text).not.toContain(french);
  }
  await page
    .getByRole('button', { name: 'Open the account menu' })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole('radio', { name: 'Français' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});
