// `test` des tests de fumée : le navigateur ajoute l'en-tête de contournement de la protection
// Vercel, mais seulement vers l'application et le site (jamais vers un tiers).
import { test as base } from '@playwright/test';
import { bypassHeaders, isOwnOrigin, smokeTargets } from './targets';

export const targets = smokeTargets(process.env);

export const test = base.extend({
  // « provide » plutôt que « use » : la règle react-hooks prendrait `use` pour le hook de React.
  context: async ({ context }, provide) => {
    const headers = bypassHeaders(targets);
    if (Object.keys(headers).length > 0) {
      await context.route(
        (url) => isOwnOrigin(url, targets),
        (route) => route.continue({ headers: { ...route.request().headers(), ...headers } }),
      );
    }
    await provide(context);
  },
});

export { expect } from '@playwright/test';
