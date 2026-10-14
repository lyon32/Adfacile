import nextVitals from 'eslint-config-next/core-web-vitals';
import { pubekaConfig } from '@pubeka/config/eslint';

const config = [
  ...nextVitals,
  ...pubekaConfig('web', { tsconfigRootDir: import.meta.dirname }),
  {
    // Version écrite : la détection automatique d'eslint-plugin-react 7.37.5 plante sous ESLint 10.
    settings: { react: { version: '19.3' } },
  },
  {
    // next-intl impose l'export par défaut de i18n/request.ts (configuration lue par le plugin).
    files: ['i18n/request.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  { ignores: ['next-env.d.ts'] },
];

export default config;
