// Configuration Prettier commune (CONVENTIONS §3.2). Prettier s'occupe seul de la mise en forme.
/** @type {import('prettier').Config} */
const config = {
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  arrowParens: 'always',
  plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
