import 'server-only';
// Session de l'utilisateur côté serveur (LLD §2.1 server/auth/session.ts).
import { redirect } from 'next/navigation';
import { createRequestAuthClient } from './supabase';

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Utilisateur connecté, ou null. Le jeton est vérifié (getClaims), jamais lu sans contrôle. */
export async function getSession(): Promise<SessionUser | null> {
  const client = await createRequestAuthClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data) return null;
  const { sub, email } = data.claims;
  return { id: sub, email: typeof email === 'string' ? email : null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/connexion');
  return user;
}

export interface ProfilePrefs {
  timezone: string;
  uiLanguage: 'fr' | 'en';
}

/** Fuseau et langue déclarés (TR-PLT-04) ; lecture soumise à la RLS, filtrée par l'utilisateur. */
export async function getProfilePrefs(userId: string): Promise<ProfilePrefs | null> {
  const client = await createRequestAuthClient();
  const { data, error } = await client
    .from('profiles')
    .select('timezone, ui_language')
    .eq('id', userId)
    .maybeSingle();
  if (error || data === null) return null;
  return { timezone: data.timezone, uiLanguage: data.ui_language === 'en' ? 'en' : 'fr' };
}
