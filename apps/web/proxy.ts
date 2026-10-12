// Aiguillage par nom de domaine (LLD §2.2) : un seul projet Next.js sert le site public,
// l'application et l'administration. Les dossiers internes `site/`, `console/` et `admin/`
// ne sont jamais accessibles directement : ils répondent 404.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getEnv } from '@pubeka/shared';
import { withSession } from './server/auth/proxy-session';

const LOCALES = ['fr', 'en'] as const;
const DEFAULT_LOCALE = 'fr';
const INTERNAL_PREFIXES = ['/site', '/console', '/admin'];
// Chemin sans page : Next.js y répond par la page 404.
const NOT_FOUND_PATH = '/_introuvable';

function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function siteHosts(): string[] {
  return (process.env.SITE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '');
}

function preferredLocale(acceptLanguage: string | null): string {
  const first = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return LOCALES.find((locale) => locale === first) ?? DEFAULT_LOCALE;
}

function rewriteTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

function notFound(request: NextRequest): NextResponse {
  return rewriteTo(request, NOT_FOUND_PATH);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get('host') ?? '').toLowerCase();

  if (INTERNAL_PREFIXES.some((prefix) => hasPrefix(pathname, prefix))) {
    return notFound(request);
  }

  if (siteHosts().includes(host)) {
    // Site public : pas d'API, langue obligatoire dans l'adresse.
    if (hasPrefix(pathname, '/api')) return notFound(request);
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale(request.headers.get('accept-language'))}`;
      return NextResponse.redirect(url, 308);
    }
    return rewriteTo(request, `/site${pathname}`);
  }

  // Application (tout autre domaine, y compris un tunnel de développement).
  if (hasPrefix(pathname, '/api')) return NextResponse.next();
  const adminPath = process.env.ADMIN_PATH;
  if (adminPath !== undefined && adminPath !== '' && hasPrefix(pathname, `/${adminPath}`)) {
    return rewriteTo(request, `/admin${pathname.slice(adminPath.length + 1)}`);
  }
  // Application : session Supabase rafraîchie, connexion obligatoire hors écrans d'accès (S04).
  const env = getEnv();
  return withSession(
    request,
    {
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    },
    () => rewriteTo(request, `/console${pathname === '/' ? '' : pathname}`),
  );
}

export const config = {
  // Ni les fichiers de Next.js, ni les fichiers statiques (un point suivi d'une extension).
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.[a-z0-9]+$).*)'],
};
