import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Faux @supabase/ssr : la session (claims) et les cookies rafraîchis sont pilotés par le test.
const state: {
  claims: unknown;
  refreshed: { name: string; value: string; options: Record<string, unknown> }[];
} = {
  claims: null,
  refreshed: [],
};
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (l: typeof state.refreshed) => void } },
  ) => ({
    auth: {
      getClaims: () => {
        if (state.refreshed.length > 0) opts.cookies.setAll(state.refreshed);
        return Promise.resolve({
          data: state.claims === null ? null : { claims: state.claims },
          error: null,
        });
      },
    },
  }),
}));

const { withSession } = await import('./proxy-session');
const env = {
  supabaseUrl: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_x',
  appUrl: 'http://app.localhost:5173',
};
const req = (path: string): NextRequest =>
  new NextRequest(new URL(path, 'http://app.localhost:5173'));
const rewrite = (): NextResponse =>
  NextResponse.rewrite(new URL('/console', 'http://app.localhost:5173'));

beforeEach(() => {
  state.claims = null;
  state.refreshed = [];
});

describe('withSession (proxy.ts)', () => {
  it('sans session : redirige vers la connexion avec le chemin de retour', async () => {
    const res = await withSession(req('/campagnes?onglet=actives'), env, rewrite);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://app.localhost:5173/connexion?retour=%2Fcampagnes%3Fonglet%3Dactives',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('avec session : laisse passer et recopie les cookies rafraîchis', async () => {
    state.claims = { sub: 'u1' };
    state.refreshed = [
      { name: 'sb-access', value: 'v2', options: { httpOnly: true, sameSite: 'lax', path: '/' } },
    ];
    const res = await withSession(req('/'), env, rewrite);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/console');
    const cookie = res.cookies.get('sb-access');
    expect(cookie?.value).toBe('v2');
    expect(cookie?.httpOnly).toBe(true);
  });
});
