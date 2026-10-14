import { defineConfig } from 'vitest/config';

// Seuils de TESTING §4.1 : server/ 90 % des lignes et 85 % des branches ; features/ 60 % et 50 %.
// Les fichiers qui ne font que brancher Next.js ou Supabase (cookies, adaptateur, dépendances
// réelles) sont prouvés par la pile locale (captures de la PR), pas par des tests unitaires.
export default defineConfig({
  test: {
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**', '**/*.int.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts', 'features/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'server/auth/supabase.ts',
        'server/auth/deps.ts',
        'server/auth/session.ts',
        'features/shell/viewer.ts',
        'features/auth/request-locale.ts',
        'server/auth/testing/**',
        'server/http/deps.ts',
        'server/http/routes.ts',
        'server/http/testing/**',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        'server/**': { lines: 90, branches: 85 },
        'features/**': { lines: 60, branches: 50 },
      },
    },
  },
});
