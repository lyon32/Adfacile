import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { supabaseGateway } from './gateway';
import { authCookieOptions } from './cookie-options';

/** Faux client Supabase : enregistre les appels de l'adaptateur et renvoie `reply`. */
function fakeClient(reply: (method: string) => { data?: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const method =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ method: name, args });
      return Promise.resolve({ data: {}, ...reply(name) });
    };
  const auth = Object.fromEntries(
    [
      'signInWithPassword',
      'signUp',
      'signInWithOtp',
      'resetPasswordForEmail',
      'resend',
      'updateUser',
      'signOut',
      'signInWithOAuth',
      'exchangeCodeForSession',
      'verifyOtp',
    ].map((n) => [n, vi.fn(method(n))]),
  );
  return { client: { auth } as unknown as SupabaseClient, calls };
}

describe('supabaseGateway', () => {
  it('passe le jeton CAPTCHA et les adresses de retour à Supabase', async () => {
    const { client, calls } = fakeClient(() => ({ error: null }));
    const g = supabaseGateway(client);
    expect(
      await g.signInWithPassword({ email: 'a@b.cm', password: 'p', captchaToken: 't' }),
    ).toBeNull();
    await g.signInWithOtp({ email: 'a@b.cm', captchaToken: 't', emailRedirectTo: 'r' });
    await g.resetPasswordForEmail({ email: 'a@b.cm', captchaToken: 't', redirectTo: 'r' });
    await g.resendSignUp({ email: 'a@b.cm', captchaToken: 't', emailRedirectTo: 'r' });
    await g.updatePassword('nouveau');
    await g.signOut('others');
    await g.exchangeCode('c');
    await g.verifyEmailToken('h', 'recovery');
    expect(calls.map((c) => c.method)).toEqual([
      'signInWithPassword',
      'signInWithOtp',
      'resetPasswordForEmail',
      'resend',
      'updateUser',
      'signOut',
      'exchangeCodeForSession',
      'verifyOtp',
    ]);
    expect(calls[0]?.args[0]).toEqual({
      email: 'a@b.cm',
      password: 'p',
      options: { captchaToken: 't' },
    });
    expect(calls[1]?.args[0]).toMatchObject({ options: { shouldCreateUser: false } });
  });

  it('réduit l’erreur à son code et son statut', async () => {
    const { client } = fakeClient(() => ({
      error: { code: 'invalid_credentials', status: 400, message: 'texte' },
    }));
    expect(
      await supabaseGateway(client).signInWithPassword({
        email: 'a',
        password: 'b',
        captchaToken: 'c',
      }),
    ).toEqual({
      code: 'invalid_credentials',
      status: 400,
    });
  });

  it('inscription : e-mail existant reconnu par l’utilisateur sans identité', async () => {
    const existing = fakeClient(() => ({ data: { user: { identities: [] } }, error: null }));
    const fresh = fakeClient(() => ({
      data: { user: { identities: [{ id: '1' }] } },
      error: null,
    }));
    const args = {
      email: 'a@b.cm',
      password: '12345678',
      captchaToken: 't',
      emailRedirectTo: 'r',
      data: {},
    };
    expect((await supabaseGateway(existing.client).signUp(args)).alreadyRegistered).toBe(true);
    expect((await supabaseGateway(fresh.client).signUp(args)).alreadyRegistered).toBe(false);
  });

  it('OAuth : adresse du fournisseur, ou null en cas d’erreur', async () => {
    const ok = fakeClient(() => ({ data: { url: 'https://accounts.google.com/o' }, error: null }));
    expect(await supabaseGateway(ok.client).oauthUrl('google', 'r')).toBe(
      'https://accounts.google.com/o',
    );
    expect(ok.calls[0]?.args[0]).toEqual({ provider: 'google', options: { redirectTo: 'r' } });
    const ko = fakeClient(() => ({ data: { url: null }, error: { code: 'validation_failed' } }));
    expect(await supabaseGateway(ko.client).oauthUrl('apple', 'r')).toBeNull();
  });
});

describe('authCookieOptions', () => {
  it('HttpOnly, SameSite=Lax ; Secure dès que l’application est en https', () => {
    expect(authCookieOptions('https://app.pubeka.com')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
    expect(authCookieOptions('http://app.localhost:5173').secure).toBe(false);
  });
});
