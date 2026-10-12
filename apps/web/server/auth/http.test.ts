import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { authAction, clientIp, isAllowedOrigin, resultResponse } from './http';
import { SignInBodySchema, SignUpBodySchema } from './schemas';

const APP = 'http://app.localhost:5173';
const post = (body: unknown, origin: string | null = APP): Request =>
  new Request(`${APP}/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { email: 'awa@test.cm', password: 'x', captcha_token: 't' };

describe('authAction', () => {
  const handler = authAction({ appUrl: () => APP, schema: SignInBodySchema }, (body) =>
    Promise.resolve(
      body.password === 'x' ? { outcome: 'ok' } : { outcome: 'locked', retryAfterS: 900 },
    ),
  );

  it('accepte une requête de l’application avec un corps valide', async () => {
    const res = await handler(post(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'ok' });
  });

  it('refuse une autre origine (CSRF) : 403 forbidden', async () => {
    const res = await handler(post(good, 'https://pirate.test'));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'forbidden' });
  });

  it('refuse une requête sans en-tête Origin', async () => {
    expect((await handler(post(good, null))).status).toBe(403);
  });

  it('refuse un corps invalide, un JSON cassé ou un champ inconnu : 400 validation_failed', async () => {
    for (const body of [
      '{oups',
      { email: 'pas-un-email', password: 'x', captcha_token: 't' },
      { ...good, admin: true },
    ]) {
      const res = await handler(post(body));
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toBe('application/problem+json');
    }
  });

  it('blocage : 429 avec Retry-After', async () => {
    const res = await handler(post({ ...good, password: 'y' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('900');
    expect(await res.json()).toEqual({ outcome: 'locked', retry_after_s: 900 });
  });

  it('convertit une AppError, et toute autre panne en 503', async () => {
    const appErr = authAction({ appUrl: () => APP, schema: SignInBodySchema }, () =>
      Promise.reject(new AppError('rate_limited', { retryAfterS: 30 })),
    );
    const res = await appErr(post(good));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    const crash = authAction({ appUrl: () => APP, schema: SignInBodySchema }, () =>
      Promise.reject(new Error('base injoignable')),
    );
    expect((await crash(post(good))).status).toBe(503);
  });
});

describe('schéma d’inscription', () => {
  const base = {
    email: 'a@b.cm',
    password: '12345678',
    captcha_token: 't',
    accept_terms: true,
    locale: 'fr',
  };
  it('exige les conditions acceptées et 8 caractères', () => {
    expect(SignUpBodySchema.safeParse(base).success).toBe(true);
    expect(SignUpBodySchema.safeParse({ ...base, accept_terms: false }).success).toBe(false);
    expect(SignUpBodySchema.safeParse({ ...base, password: '1234567' }).success).toBe(false);
  });
});

describe('outils', () => {
  it('statut HTTP de chaque issue', () => {
    expect(resultResponse({ outcome: 'invalid_credentials' }).status).toBe(401);
    expect(resultResponse({ outcome: 'email_taken' }).status).toBe(409);
    expect(resultResponse({ outcome: 'link_expired' }).status).toBe(410);
  });

  it('adresse IP : x-forwarded-for, puis x-real-ip, sinon « unknown »', () => {
    const r = (h: Record<string, string>): Request => new Request(APP, { headers: h });
    expect(clientIp(r({ 'x-forwarded-for': '41.1.1.1, 10.0.0.1' }))).toBe('41.1.1.1');
    expect(clientIp(r({ 'x-real-ip': '41.2.2.2' }))).toBe('41.2.2.2');
    expect(clientIp(r({}))).toBe('unknown');
  });

  it('origine : compare l’origine exacte', () => {
    const r = new Request(APP, { headers: { origin: 'http://app.localhost:5173' } });
    expect(isAllowedOrigin(r, `${APP}/`)).toBe(true);
  });
});
