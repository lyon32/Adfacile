// Parcours critiques (TESTING §3.4) : `pnpm e2e:ci` construit l'application, la démarre sur le
// port 5173 puis lance les parcours à 390 et 1280 px ; les captures de la coque ajoutent 360 et
// 768 px (TR-PLT-01). La pile Supabase locale doit tourner (`pnpm ci:env` pour les variables).
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Pas de fichier local : les variables viennent de l'environnement (CI).
}

const APP = 'http://app.localhost:5173';
const viewport = (width: number, height: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
});

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  outputDir: '../../test-results/journeys',
  timeout: 90_000,
  use: {
    baseURL: APP,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec next start -p 5173',
    cwd: '../..',
    port: 5173,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'tel-360',
      testMatch: ['shell.spec.ts', 'onboarding.spec.ts'],
      use: viewport(360, 740),
    },
    { name: 'tel-390', use: viewport(390, 844) },
    {
      name: 'tablette-768',
      testMatch: ['shell.spec.ts', 'onboarding.spec.ts'],
      use: viewport(768, 1024),
    },
    { name: 'ordinateur-1280', use: viewport(1280, 800) },
  ],
});
