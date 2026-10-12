// GET /auth/callback : retour de Google, d'Apple, du lien magique, de la confirmation d'e-mail
// et du lien de réinitialisation (LLD §2.1).
import { NextResponse } from 'next/server';
import { handleAuthCallback } from '../../../../../server/auth/callback';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const deps = await requestAuthDeps();
  const path = await handleAuthCallback(deps.gateway, searchParams);
  // Adresse publique de l'application, jamais l'hôte interne réécrit par proxy.ts.
  return NextResponse.redirect(new URL(path, appUrl()));
}
