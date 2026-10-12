import { defineConfig } from 'vitest/config';

// Seuils de TESTING §4.1 pour packages/shared : 80 % des lignes, 75 % des branches.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, branches: 75 },
    },
  },
});
