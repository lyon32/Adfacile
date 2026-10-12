import { defineConfig } from 'vitest/config';

// Pas de seuil propre à packages/db dans TESTING §4.1 ; les types générés sont exclus.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/database.types.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
