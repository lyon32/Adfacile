// Tests de fumée (CI_CD §4, étape 4) : la préproduction répond après chaque déploiement.
// Lecture seule. Adresses : BASE_URL (application) et SITE_BASE_URL (site public) ;
// en-tête x-vercel-protection-bypass si VERCEL_AUTOMATION_BYPASS_SECRET est fourni.
import { expect, targets, test } from './fixtures';
import { bypassHeaders } from './targets';

test.describe('TR-DSP-01 · la préproduction répond', () => {
  test('page publique : la racine renvoie vers la langue, la page /fr s’affiche', async ({
    page,
    request,
  }) => {
    const root = await request.get(`${targets.siteUrl}/`, {
      headers: { ...bypassHeaders(targets), 'accept-language': 'fr-FR,fr;q=0.9' },
      maxRedirects: 0,
    });
    expect(root.status()).toBe(308);
    expect(new URL(root.headers().location ?? '', targets.siteUrl).pathname).toBe('/fr');

    const response = await page.goto(`${targets.siteUrl}/fr`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main[data-zone="site"]')).toBeVisible();
  });

  test('connexion : l’écran de connexion s’affiche avec ses champs', async ({ page }) => {
    const response = await page.goto(`${targets.appUrl}/connexion`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Mot de passe')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });

  test('TR-DSP-03 · /api/v1/public/maintenance répond avec l’état du mode maintenance', async ({
    request,
  }) => {
    const response = await request.get(`${targets.appUrl}/api/v1/public/maintenance`, {
      headers: bypassHeaders(targets),
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body: unknown = await response.json();
    expect(isMaintenance(body)).toBe(true);
  });
});

/** Schéma `Maintenance` d'api/openapi.yaml : `{ active: boolean, message: string | null }`. */
function isMaintenance(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (!('active' in value) || typeof value.active !== 'boolean') return false;
  return !('message' in value) || value.message === null || typeof value.message === 'string';
}
