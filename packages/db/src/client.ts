// Les deux clients de la base (LLD §4 « packages/db »).
// - Client utilisateur : clé publiable + jeton de session ; soumis à la RLS.
// - Client service : clé secrète ; contourne la RLS. SERVEUR UNIQUEMENT (LLD §3 règle 4).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type DbClient = SupabaseClient<Database>;
/** Marque de type : un `ServiceClient` ne s'obtient que par `createServiceClient`. */
export type ServiceClient = DbClient & { readonly __service: true };

const noSession = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export function createUserClient(args: {
  url: string;
  publishableKey: string;
  accessToken?: string;
}): DbClient {
  if (!args.publishableKey.startsWith('sb_publishable_')) {
    throw new Error('createUserClient attend une clé publiable (sb_publishable_…)');
  }
  return createClient<Database>(args.url, args.publishableKey, {
    auth: noSession,
    ...(args.accessToken
      ? { global: { headers: { Authorization: `Bearer ${args.accessToken}` } } }
      : {}),
  });
}

export function createServiceClient(args: { url: string; secretKey: string }): ServiceClient {
  if ('window' in globalThis) {
    throw new Error('createServiceClient est interdit dans le navigateur');
  }
  if (!args.secretKey.startsWith('sb_secret_')) {
    throw new Error('createServiceClient attend une clé secrète (sb_secret_…)');
  }
  const client = createClient<Database>(args.url, args.secretKey, { auth: noSession });
  return Object.assign(client, { __service: true as const });
}
