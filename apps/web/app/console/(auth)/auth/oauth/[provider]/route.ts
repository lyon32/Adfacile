// GET /auth/oauth/{google|apple} : départ vers Google ou Apple via Supabase Auth (PKCE : le
// vérificateur est gardé dans un cookie). Documentation : supabase.com/docs/guides/auth/social-login.
import { NextResponse } from 'next/server';
import { appUrl, requestAuthDeps } from '../../../../../../server/auth/deps';
import { OAUTH_PROVIDERS, type OAuthProvider } from '../../../../../../server/auth/gateway';

function isProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await params;
  const base = appUrl();
  if (!isProvider(provider)) return NextResponse.redirect(new URL('/connexion', base));
  const deps = await requestAuthDeps();
  const url = await deps.gateway.oauthUrl(provider, deps.callbackUrl);
  if (url === null) {
    return NextResponse.redirect(new URL('/connexion?erreur=connexion_impossible', base));
  }
  return NextResponse.redirect(url);
}
