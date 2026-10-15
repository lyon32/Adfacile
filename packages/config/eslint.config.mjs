// Configuration ESLint commune (CONVENTIONS §3.3), format « flat ».
// Chaque module l'importe avec `pubekaConfig('<module>')` : les règles de dépendance
// du LLD §3 (une flèche ne remonte jamais) dépendent du module qui importe.
// Elles passent par `no-restricted-imports` : eslint-plugin-boundaries 7.2.0 ne voit pas
// un import d'un paquet non déclaré (non résolu), donc ne bloquait rien.
import tseslint from 'typescript-eslint';

/** Modules @pubeka/* que chaque module a le droit d'importer (LLD §3). */
export const ALLOWED_INTERNAL = {
  // `jobs` : apps/web lance les tâches de fond par `createJobDispatcher` (mode `inline` : les gestionnaires s'exécutent dans le
  // processus web, TESTING §6.1). S14 est le premier consommateur (journal S13, « remarqué hors périmètre »).
  web: ['core', 'jobs', 'ui', 'api-client', 'db', 'contracts', 'shared', 'i18n', 'testing'],
  jobs: ['core', 'db', 'contracts', 'shared', 'i18n', 'testing'],
  core: [
    'agents',
    'media',
    'platforms',
    'billing',
    'notifications',
    'db',
    'contracts',
    'shared',
    'i18n',
    'testing',
  ],
  agents: ['contracts', 'shared', 'i18n', 'testing'],
  media: ['contracts', 'shared', 'i18n', 'testing'],
  platforms: ['contracts', 'shared', 'i18n', 'testing'],
  billing: ['contracts', 'shared', 'i18n', 'testing'],
  notifications: ['contracts', 'shared', 'i18n', 'testing'],
  db: ['contracts', 'shared', 'i18n', 'testing'],
  'api-client': ['contracts', 'shared'],
  ui: ['shared', 'i18n'],
  contracts: ['shared'],
  shared: [],
  i18n: [],
  testing: [
    'core',
    'agents',
    'media',
    'platforms',
    'billing',
    'notifications',
    'db',
    'contracts',
    'shared',
    'i18n',
  ],
};

/** Imports interdits partout (CONVENTIONS §3.3). */
const RESTRICTED_PATHS = [
  { name: 'axios', message: 'Utiliser fetch, ou @pubeka/api-client.' },
  { name: 'moment', message: 'Utiliser Intl et les fonctions de @pubeka/shared.' },
  { name: 'dayjs', message: 'Utiliser Intl et les fonctions de @pubeka/shared.' },
  { name: '@react-email/components', message: 'Paquet abandonné : utiliser react-email.' },
];

const RESTRICTED_PATTERNS = [
  {
    group: ['**/packages/*', '**/packages/**'],
    message: 'Importer un autre module par @pubeka/<module>, jamais par un chemin relatif.',
  },
];

/**
 * @param {keyof typeof ALLOWED_INTERNAL} moduleName module qui importe
 * @param {{ tsconfigRootDir: string }} options dossier du module (import.meta.dirname)
 */
export function pubekaConfig(moduleName, { tsconfigRootDir }) {
  const allowed = new Set(ALLOWED_INTERNAL[moduleName]);
  const forbidden = Object.keys(ALLOWED_INTERNAL).filter(
    (name) => name !== moduleName && !allowed.has(name),
  );

  return tseslint.config(
    { ignores: ['**/.next/**', '**/dist/**', '**/coverage/**', '**/*.d.ts'] },
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        eqeqeq: 'error',
        // `import/no-default-export` sans dépendance de plus ; exceptions plus bas.
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportDefaultDeclaration',
            message: 'Export nommé obligatoire (CONVENTIONS §3.3).',
          },
        ],
        'no-console': 'error',
        'no-restricted-imports': [
          'error',
          {
            paths: [
              ...RESTRICTED_PATHS,
              // Règles de dépendance du LLD §3 : une flèche ne remonte jamais.
              ...forbidden.map((name) => ({
                name: `@pubeka/${name}`,
                message: `@pubeka/${moduleName} ne peut pas importer @pubeka/${name} (LLD §3).`,
              })),
            ],
            patterns: [
              ...RESTRICTED_PATTERNS,
              ...forbidden.map((name) => ({
                group: [`@pubeka/${name}/*`],
                message: `@pubeka/${moduleName} ne peut pas importer @pubeka/${name} (LLD §3).`,
              })),
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
    {
      // Fichiers dont l'export par défaut est imposé par l'outil (Next.js, configurations).
      files: [
        '**/*.config.{ts,mjs,js}',
        '**/app/**/{page,layout,not-found,global-error,error,loading,template,default}.tsx',
        '**/app/**/{sitemap,robots}.ts',
      ],
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      files: ['**/*.mjs', '**/*.js'],
      ...tseslint.configs.disableTypeChecked,
    },
  );
}
