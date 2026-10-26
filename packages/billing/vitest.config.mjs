import { defineConfig } from 'vitest/config';

// Seuils de TESTING §4.1 pour packages/billing : 95 % des lignes, 90 % des branches.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 95, branches: 90 },
    },
  },
});
