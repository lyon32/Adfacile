// Première configuration (APPFLOW §5) : un compte sans pays est mené à /bienvenue/pays, passe les
// cinq étapes, puis arrive au tableau de bord ; pays, ville, monnaie, fuseau et langue sont
// enregistrés (TR-PLT-04).
import { expect, test } from '@playwright/test';
import { createConfirmedUser, overflowsHorizontally, signIn, axeAnalyze } from './support';

test('de la première configuration au tableau de bord', async ({ page }, info) => {
  const user = await createConfirmedUser('Mariam', { onboarded: false });
  await signIn(page, user);

  await page.goto('/');
  await expect(page).toHaveURL(/\/bienvenue\/pays$/);
  await expect(page.getByText('Étape 1 sur 5')).toBeVisible();
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({
    path: `../../test-results/captures/bienvenue-pays-${info.project.name}.png`,
  });
  expect((await axeAnalyze(page)).violations.map((v) => v.id)).toEqual([]);

  // Sans pays, on ne continue pas.
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Choisis ton pays pour continuer.')).toBeVisible();

  await page.getByLabel('Pays').selectOption('SN');
  await expect(page.getByLabel('Monnaie d’affichage')).toHaveValue('XOF');
  await page.getByLabel('Ville').fill('Dakar');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page).toHaveURL(/\/bienvenue\/langue$/);
  await page.getByRole('radio', { name: 'English' }).check();
  await page.getByRole('button', { name: 'Continuer' }).click();

  // La langue choisie s'applique tout de suite.
  await expect(page).toHaveURL(/\/bienvenue\/essai$/);
  await expect(page.getByText('Step 3 of 5')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your free trial starts now');
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page).toHaveURL(/\/bienvenue\/meta$/);
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/marque$/);
  await page.getByRole('button', { name: 'Later' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariam');
  await expect(page.getByText('Create your first ad')).toBeVisible();

  // Enregistré dans le profil, avec le fuseau du pays.
  const me = await page.evaluate(
    async () => (await fetch('/api/v1/me')).json() as Promise<Record<string, unknown>>,
  );
  expect(me).toMatchObject({
    country_code: 'SN',
    city: 'Dakar',
    currency_display: 'XOF',
    timezone: 'Africa/Dakar',
    ui_language: 'en',
  });
});

test('une étape inconnue répond 404', async ({ page }) => {
  const user = await createConfirmedUser('Awa');
  await signIn(page, user);
  const response = await page.goto('/bienvenue/inconnue');
  expect(response?.status()).toBe(404);
});
