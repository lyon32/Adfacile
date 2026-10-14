// Contrôles de la page de démonstration : axe, « réduire les animations », captures 390/1280.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  outputDir: 'test-results',
  use: { baseURL: 'http://localhost:5180', locale: 'fr-FR', trace: 'off' },
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
  webServer: {
    command: 'pnpm exec vite --config vite.config.ts',
    url: 'http://localhost:5180',
    reuseExistingServer: process.env.CI === undefined,
    timeout: 60_000,
  },
});
