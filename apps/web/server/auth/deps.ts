import 'server-only';
// Dépendances réelles des actions de connexion, pour une requête.
import { getEnv } from '@pubeka/shared';
import type { AuthDeps } from './actions';
import { supabaseGateway } from './gateway';
import { dbLockStore } from './login-lock';
import { callbackUrl, createAuthServiceClient, createRequestAuthClient } from './supabase';

export async function requestAuthDeps(): Promise<AuthDeps> {
  return {
    gateway: supabaseGateway(await createRequestAuthClient()),
    locks: dbLockStore(createAuthServiceClient()),
    callbackUrl: callbackUrl(),
  };
}

export function appUrl(): string {
  return getEnv().NEXT_PUBLIC_APP_URL;
}
