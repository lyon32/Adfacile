// Routes GET et PATCH /api/v1/me contre la pile Supabase locale (API_SPEC §15 : les 5 cas).
import { randomUUID } from 'node:crypto';
import {
  createTestUser,
  describeRoute,
  na,
  setMaintenance,
  testServiceClient,
  type TestUser,
} from '@pubeka/testing';
import { afterAll, beforeAll, expect } from 'vitest';
import { GET, PATCH } from './route';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let awa: TestUser;
let other: TestUser;

beforeAll(async () => {
  [awa, other] = await Promise.all([createTestUser({ label: 'me' }), createTestUser({ label: 'other' })]);
});

afterAll(async () => {
  await setMaintenance(false);
});

/** Adresse IP propre à chaque requête : la limite par IP ne gêne pas les autres tests. */
function call(method: 'GET' | 'PATCH', headers: Record<string, string>, body?: unknown): Request {
  return new Request(`${APP}/api/v1/me`, {
    method,
    headers: { 'x-forwarded-for': `10.${String(Math.floor(Math.random() * 250))}.0.1`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describeRoute('getMe', {
  success: async () => {
    const res = await GET(call('GET', awa.headers));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toMatch(/^req_[0-9A-Z]{16}$/);
    const me = await json(res);
    expect(me).toMatchObject({
      id: awa.id,
      email: awa.email,
      ui_language: 'fr',
      timezone: 'Africa/Douala',
      currency_display: 'XAF',
      theme: 'light',
    });
    expect(['bonjour', 'bonsoir']).toContain(me.greeting);
  },
  unauthenticated: async () => {
    const res = await GET(call('GET', {}));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await json(res)).toMatchObject({ code: 'unauthenticated', status: 401, instance: '/api/v1/me' });
  },
  otherWorkspace: na("/me ne dépend d'aucun espace : chacun ne lit que son profil (RLS)"),
  forbiddenRole: na('/me est ouvert à tout utilisateur connecté, sans rôle'),
  invalidBody: na('GET sans corps'),
  extra: {
    'session web (cookie @supabase/ssr) acceptée': async () => {
      const res = await GET(call('GET', { cookie: awa.cookie }));
      expect(res.status).toBe(200);
      expect((await json(res)).id).toBe(awa.id);
    },
    '401 session_expired avec un jeton faux ou périmé': async () => {
      const res = await GET(call('GET', { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x' }));
      expect(res.status).toBe(401);
      expect((await json(res)).code).toBe('session_expired');
    },
    '503 maintenance (EC-ADM-02)': async () => {
      await setMaintenance(true, 'Mise à jour');
      try {
        const res = await GET(call('GET', awa.headers));
        expect(res.status).toBe(503);
        expect(res.headers.get('retry-after')).toBe('300');
        expect((await json(res)).code).toBe('maintenance');
      } finally {
        await setMaintenance(false);
      }
    },
  },
});

describeRoute('updateMe', {
  success: async () => {
    const res = await PATCH(call('PATCH', awa.headers, { city: '  Yaoundé ', theme: 'dark', ui_language: 'en' }));
    expect(res.status).toBe(200);
    const me = await json(res);
    expect(me).toMatchObject({ city: 'Yaoundé', theme: 'dark', ui_language: 'en' });
    expect(['hello', 'good_evening']).toContain(me.greeting);
    const { data } = await testServiceClient().from('profiles').select('city, theme').eq('id', awa.id).single();
    expect(data).toEqual({ city: 'Yaoundé', theme: 'dark' });
    // Le profil d'un autre utilisateur n'a pas bougé.
    const { data: untouched } = await testServiceClient().from('profiles').select('city').eq('id', other.id).single();
    expect(untouched?.city).toBeNull();
  },
  unauthenticated: async () => {
    const res = await PATCH(call('PATCH', { origin: APP }, { city: 'X' }));
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('unauthenticated');
  },
  otherWorkspace: na("/me ne dépend d'aucun espace ; l'identifiant vient du jeton, jamais du corps"),
  forbiddenRole: na('/me est ouvert à tout utilisateur connecté, sans rôle'),
  invalidBody: async () => {
    const res = await PATCH(call('PATCH', awa.headers, { id: randomUUID(), phone: '0612', theme: 'neon' }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('validation_failed');
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'id', code: 'unknown_field' }),
        expect.objectContaining({ field: 'phone', code: 'invalid_format' }),
        expect.objectContaining({ field: 'theme', code: 'invalid_value' }),
      ]),
    );
  },
  extra: {
    '403 forbidden : écriture par cookie sans Origin de l’application (CSRF)': async () => {
      const res = await PATCH(call('PATCH', { cookie: awa.cookie, origin: 'https://evil.example' }, { city: 'Pirate' }));
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('forbidden');
      const ok = await PATCH(call('PATCH', { cookie: awa.cookie, origin: new URL(APP).origin }, { city: 'Kribi' }));
      expect(ok.status).toBe(200);
    },
    '400 champ trop long (limites identiques à la base)': async () => {
      const res = await PATCH(call('PATCH', awa.headers, { first_name: 'a'.repeat(81) }));
      expect(res.status).toBe(400);
      expect((await json(res)).errors).toEqual([expect.objectContaining({ field: 'first_name', code: 'too_long' })]);
    },
    'TR-PLT-04 : changer de pays recalcule le fuseau ; un pays inconnu est refusé (400)': async () => {
      const ok = await PATCH(call('PATCH', awa.headers, { country_code: 'SN', currency_display: 'XOF' }));
      expect(ok.status).toBe(200);
      expect(await json(ok)).toMatchObject({ country_code: 'SN', timezone: 'Africa/Dakar', currency_display: 'XOF' });
      const unknown = await PATCH(call('PATCH', awa.headers, { country_code: 'ZZ' }));
      expect(unknown.status).toBe(400);
      expect((await json(unknown)).errors).toEqual([expect.objectContaining({ field: 'country_code', code: 'unknown_country' })]);
    },
    '413 corps de plus de 1 Mo': async () => {
      const res = await PATCH(call('PATCH', awa.headers, { city: 'a'.repeat(1024 * 1024) }));
      expect(res.status).toBe(413);
    },
  },
});
