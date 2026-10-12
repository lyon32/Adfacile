import { defineConfig } from 'vitest/config';

// Pas de seuil propre à contracts dans TESTING §4.1 ; les types générés sont exclus.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/generated/**'],
      reporter: ['text', 'json-summary'],
    },
  },
});
