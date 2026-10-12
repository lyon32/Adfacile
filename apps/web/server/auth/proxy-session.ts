// Session dans proxy.ts : rafraîchit les cookies Supabase à chaque requête de l'application et
// décide de l'accès (connexion obligatoire hors écrans d'authentification).
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieOptions } from './cookie-options';

/** Écrans ouverts sans connexion (APPFLOW §1). `/auth/*` : retours et actions de connexion. */
const PUBLIC_PATHS = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/verifier-email'];
/** Écrans réservés aux visiteurs : un utilisateur connecté va au tableau de bord. */
const GUEST_ONLY_PATHS = ['/connexion', '/inscription', '/verifier-email'];

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export type Access = { kind: 'allow' } | { kind: 'redirect'; to: string };

export function decideAccess(pathname: string, search: string, isSignedIn: boolean): Access {
  if (matches(pathname, '/auth')) return { kind: 'allow' };
  // Nouveau mot de passe : exige la session ouverte par le lien de réinitialisation.
  if (matches(pathname, '/mot-de-passe-oublie/nouveau')) {
    return isSignedIn
      ? { kind: 'allow' }
      : { kind: 'redirect', to: '/connexion?erreur=lien_expire' };
  }
  if (PUBLIC_PATHS.some((p) => matches(pathname, p))) {
    return isSignedIn && GUEST_ONLY_PATHS.some((p) => matches(pathname, p))
      ? { kind: 'redirect', to: '/' }
      : { kind: 'allow' };
  }
  if (isSignedIn) return { kind: 'allow' };
  // Après connexion : retour à l'écran d'origine (APPFLOW §4.2 bis).
  const back = pathname === '/' ? '' : `?retour=${encodeURIComponent(pathname + search)}`;
  return { kind: 'redirect', to: `/connexion${back}` };
}

export interface ProxyAuthEnv {
  supabaseUrl: string;
  publishableKey: string;
  appUrl: string;
}

/**
 * Rafraîchit la session et applique `decideAccess`. `rewrite` produit la réponse normale
 * (réécriture vers /console/…) ; les cookies rafraîchis y sont recopiés.
 */
export async function withSession(
  request: NextRequest,
  env: ProxyAuthEnv,
  rewrite: () => NextResponse,
): Promise<NextResponse> {
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(env.supabaseUrl, env.publishableKey, {
    cookieOptions: authCookieOptions(env.appUrl),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) {
          request.cookies.set(c.name, c.value);
          pending.push(c);
        }
      },
    },
  });
  // getClaims vérifie le jeton (et le rafraîchit au besoin) ; ne rien intercaler avant.
  const { data } = await supabase.auth.getClaims();
  const access = decideAccess(request.nextUrl.pathname, request.nextUrl.search, data !== null);

  let response: NextResponse;
  if (access.kind === 'redirect') {
    const url = request.nextUrl.clone();
    const target = new URL(access.to, url.origin);
    url.pathname = target.pathname;
    url.search = target.search;
    response = NextResponse.redirect(url);
  } else {
    response = rewrite();
  }
  for (const c of pending) response.cookies.set(c.name, c.value, c.options);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
