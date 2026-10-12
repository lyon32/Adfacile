import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests d'intégration (TESTING §2.4) : routes réelles contre la pile Supabase locale.
// Variables : `pnpm ci:env` (CI) ou `node scripts/ci/write-test-env.mjs` (poste local).
// `server-only` refuse d'être importé hors de React Server : remplacé par un module vide ici.
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./server/http/testing/empty.ts', import.meta.url)),
    },
  },
  test: {
    include: ['**/*.int.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Le mode maintenance est global : les fichiers ne tournent pas en parallèle.
    fileParallelism: false,
  },
});
