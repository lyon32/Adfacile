import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `queues.ts` et `tasks/` ne se chargent que dans le moteur Trigger.dev : prouvés par `trigger dev` / `deploy`.
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/queues.ts', 'src/tasks/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 85, branches: 80 },
    },
  },
});
