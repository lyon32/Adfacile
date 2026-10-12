import { pubekaConfig } from '@pubeka/config/eslint';

export default [
  // Fichier généré par `pnpm db:types` : jamais modifié à la main (CONVENTIONS §5).
  { ignores: ['src/database.types.ts'] },
  ...pubekaConfig('db', { tsconfigRootDir: import.meta.dirname }),
];
