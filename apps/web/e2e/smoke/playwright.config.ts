// Tests de fumée (CI_CD §4) : `pnpm e2e:smoke`. Aucun serveur n'est démarré ici :
// les tests visent une adresse déjà en ligne (BASE_URL, SITE_BASE_URL), par défaut le poste local.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  outputDir: '../../test-results/smoke',
  timeout: 30_000,
  use: {
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    // Pas de trace : elle contiendrait l'en-tête de contournement (secret). Capture en cas d'échec.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'telephone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'ordinateur',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
