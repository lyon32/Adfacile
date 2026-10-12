// Variables de la pile Supabase locale pour les tests d'intégration (écrites par
// `pnpm ci:env`, scripts/ci/write-test-env.mjs). Jamais de vraie clé : pile locale seulement.

export interface TestEnv {
  supabaseUrl: string;
  publishableKey: string;
  secretKey: string;
  dbUrl: string;
  appUrl: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} manque : lancer « pnpm supabase start » puis « pnpm ci:env »`);
  }
  return value;
}

export function testEnv(): TestEnv {
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
  const host = new URL(supabaseUrl).hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
    throw new Error("Tests d'intégration : la base doit être la pile locale");
  }
  return {
    supabaseUrl,
    publishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    secretKey: required('SUPABASE_SECRET_KEY'),
    dbUrl: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    appUrl: required('NEXT_PUBLIC_APP_URL'),
  };
}
