import { defineConfig } from 'vitest/config';

// TESTING §4.1 : pas de seuil pour packages/ui ; on teste les composants à comportement.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary'],
    },
  },
});
