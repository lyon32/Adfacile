import 'server-only';
// Clients Supabase liés aux cookies de la requête (@supabase/ssr). La session vit dans des
// cookies HttpOnly, Secure (hors http local) et SameSite=Lax (SECURITE-BACKEND §3).
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServiceClient, type Database, type ServiceClient } from '@pubeka/db';
import { getEnv } from '@pubeka/shared';
import { authCookieOptions } from './cookie-options';

export interface CookieJar {
  getAll(): { name: string; value: string }[];
  setAll(list: { name: string; value: string; options: Record<string, unknown> }[]): void;
}

export type AuthClient = SupabaseClient<Database>;

export function createAuthClient(jar: CookieJar): AuthClient {
  const env = getEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: authCookieOptions(env.NEXT_PUBLIC_APP_URL),
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          jar.setAll(list);
        },
      },
    },
  );
}

/** Client des gestionnaires de routes et des pages serveur (cookies de next/headers). */
export async function createRequestAuthClient(): Promise<AuthClient> {
  const store = await cookies();
  return createAuthClient({
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        for (const c of list) store.set(c.name, c.value, c.options);
      } catch {
        // Page serveur : les cookies sont en lecture seule ; proxy.ts les a déjà rafraîchis.
      }
    },
  });
}

export function createAuthServiceClient(): ServiceClient {
  const env = getEnv();
  return createServiceClient({
    url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  });
}

export function callbackUrl(): string {
  return `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback`;
}
