// Réglages (APPFLOW §14) : profil, équipe, notifications. Chaque écran est enregistré, relu après
// rechargement, accessible (axe) et sans défilement horizontal (TR-PLT-01), en clair et en sombre.
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

test.beforeEach(async ({ page }) => {
  await signIn(page, user);
  await patchMe(page, { theme: 'light', ui_language: 'fr' });
});

async function checkScreen(page: Page, name: string, project: string) {
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({ path: `../../test-results/captures/${name}-${project}.png` });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
    [],
  );
}

test('profil : enregistre le nom, le pays recalcule le fuseau', async ({ page }, info) => {
  await page.goto('/reglages/profil');
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveAttribute('readonly', '');
  await checkScreen(page, 'reglages-profil', info.project.name);

  await page.getByLabel('Prénom').fill('Awa Marie');
  await page.getByLabel('Téléphone').fill('0612');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Utilise le format international : +237612345678.')).toBeVisible();

  await page.getByLabel('Téléphone').fill('+237612345678');
  await page.getByLabel('Pays').selectOption('CI');
  await expect(page.getByLabel('Monnaie d’affichage')).toHaveValue('XOF');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Modifications enregistrées.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Prénom')).toHaveValue('Awa Marie');
  await expect(page.getByLabel('Pays')).toHaveValue('CI');
  const me = await page.evaluate(
    async () => (await fetch('/api/v1/me')).json() as Promise<Record<string, unknown>>,
  );
  expect(me).toMatchObject({ phone: '+237612345678', timezone: 'Africa/Abidjan' });
});

test('équipe : le propriétaire invite, la limite de la formule est expliquée', async ({
  page,
}, info) => {
  await page.goto('/reglages/equipe');
  await expect(page.getByText('1 sur 1 membres')).toBeVisible();
  await checkScreen(page, 'reglages-equipe', info.project.name);

  // Formule Starter : un seul membre, le propriétaire (plans-et-credits).
  await page.getByLabel('E-mail').fill('collegue@example.test');
  await page.getByRole('button', { name: 'Inviter' }).click();
  await expect(page.getByText('Tu as atteint la limite de membres de ta formule.')).toBeVisible();
});

test('notifications : un interrupteur est enregistré et retrouvé après rechargement', async ({
  page,
}, info) => {
  await page.goto('/reglages/notifications');
  const toggle = page.getByRole('switch', { name: 'Résumé du lundi : E-mail' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await checkScreen(page, 'reglages-notifications', info.project.name);

  const saved = page.waitForResponse(
    (r) => r.url().includes('/notifications/preferences') && r.request().method() === 'PUT',
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect((await saved).status()).toBe(204);
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Résumé du lundi : E-mail' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('switch', { name: 'Résumé du lundi : Cloche' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('thème sombre : réglages sans débordement ni violation axe', async ({ page }, info) => {
  await patchMe(page, { theme: 'dark' });
  for (const section of ['profil', 'equipe', 'notifications']) {
    await page.goto(`/reglages/${section}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await checkScreen(page, `reglages-${section}-sombre`, info.project.name);
  }
});

test('une section inconnue répond 404', async ({ page }) => {
  const response = await page.goto('/reglages/inconnue');
  expect(response?.status()).toBe(404);
});
