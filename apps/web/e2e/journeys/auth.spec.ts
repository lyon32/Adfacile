// Écrans d'accès habillés (S04 + S09) : sans défilement horizontal (TR-PLT-01), axe sans violation,
// clair et sombre, et bascule de langue sans texte français qui reste (TR-PLT-03).
import { expect, test } from '@playwright/test';
import { overflowsHorizontally, axeAnalyze } from './support';

const SCREENS = [
  { path: '/connexion', name: 'connexion', fr: 'Connexion', en: 'Sign in' },
  { path: '/inscription', name: 'inscription', fr: 'Créer ton compte', en: 'Create your account' },
  {
    path: '/mot-de-passe-oublie',
    name: 'mot-de-passe-oublie',
    fr: 'Mot de passe oublié',
    en: 'Forgot your password',
  },
];

for (const theme of ['light', 'dark'] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} (${theme}) : sans défilement horizontal et sans violation axe`, async ({
      page,
      context,
    }, info) => {
      await context.addCookies([
        { name: 'pubeka-theme', value: theme, url: 'http://app.localhost:5173' },
      ]);
      await page.goto(screen.path);
      await expect(page.getByRole('heading', { level: 1, name: screen.fr })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await overflowsHorizontally(page)).toBe(false);
      await page.screenshot({
        path: `../../test-results/captures/${screen.name}-${info.project.name}-${theme}.png`,
      });
      const results = await axeAnalyze(page);
      expect(
        results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`),
      ).toEqual([]);
    });
  }
}

test('TR-PLT-03 : la bascule en anglais traduit tout l’écran de connexion', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  const text = await page.locator('body').innerText();
  for (const french of ['Connexion', 'Mot de passe', 'Continuer avec', 'Pas encore de compte']) {
    expect(text).not.toContain(french);
  }
  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
});
