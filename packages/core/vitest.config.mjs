import { defineConfig } from 'vitest/config';

// TESTING §4.1 : packages/core (le reste) 85 % des lignes, 80 % des branches.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-helper.ts', 'src/index.ts', 'src/context.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 85, branches: 80 },
    },
  },
});
