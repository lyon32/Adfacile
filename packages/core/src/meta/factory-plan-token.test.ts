// Dépendances Meta construites depuis l'environnement, formule des Pages, jeton chiffré.
import { FakeMetaConnector, MetaConnector, encryptToken } from '@pubeka/platforms';
import { parseEnv, type EnvSource } from '@pubeka/shared';
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { createMetaConnector, createMetaDeps } from './connector-factory';
import { pagePlanOf } from './plan';
import { KEY, NONCE, PLANS, WS, codec, metaDeps, ok } from './meta.test-helper';
import { loadToken, sealToken } from './token';

// Valeurs factices de la seule forme attendue : aucun vrai secret.
const KEY_32 = Buffer.alloc(32, 7).toString('base64');

function env(overrides: EnvSource = {}) {
  return parseEnv({
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:5173',
    NEXT_PUBLIC_APP_URL: 'http://app.localhost:5173',
    SITE_HOSTS: 'localhost:5173',
    ADMIN_PATH: 'a'.repeat(32),
    APP_SIGNING_SECRET: KEY_32,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_factice',
    SUPABASE_SECRET_KEY: 'sb_secret_factice',
    TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
    TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
    PUBEKA_JOB_DISPATCH: 'inline',
    ...overrides,
  });
}

const now = () => new Date('2026-10-14T10:00:00Z');
const args = (e = env()) => ({ env: e, now, state: codec, newNonce: () => NONCE });

describe('createMetaDeps', () => {
  it('construit l’adresse de retour et la clé active depuis l’environnement', () => {
    const deps = createMetaDeps({
      ...args(env({ PUBEKA_FAKE_PROVIDERS: 'meta' })),
    });
    expect(deps.redirectUri).toBe('http://app.localhost:5173/api/v1/meta/callback');
    expect(deps.activeKey.id).toBe('k1');
    expect(Object.keys(deps.keys)).toEqual(['k1']);
    expect(deps.connector).toBeInstanceOf(FakeMetaConnector);
  });

  it('refuse une adresse de retour invalide (NEXT_PUBLIC_APP_URL avec un chemin)', () => {
    expect(() =>
      createMetaDeps({
        ...args(
          env({
            NEXT_PUBLIC_APP_URL: 'http://app.localhost:5173/ailleurs',
            PUBEKA_FAKE_PROVIDERS: 'meta',
          }),
        ),
      }),
    ).toThrow(expect.objectContaining({ code: 'provider_unavailable' }));
  });

  it('accepte un connecteur de remplacement (tests)', () => {
    const connector = new FakeMetaConnector();
    expect(
      createMetaDeps({ ...args(env({ PUBEKA_FAKE_PROVIDERS: 'meta' })), connector }).connector,
    ).toBe(connector);
  });
});

describe('createMetaConnector', () => {
  it('« all » et « meta » donnent la fausse Meta, une autre liste le vrai connecteur', () => {
    expect(createMetaConnector(env({ PUBEKA_FAKE_PROVIDERS: 'all' }), now)).toBeInstanceOf(
      FakeMetaConnector,
    );
    expect(createMetaConnector(env({ PUBEKA_FAKE_PROVIDERS: 'saspay, meta' }), now)).toBeInstanceOf(
      FakeMetaConnector,
    );
    const real = createMetaConnector(
      env({
        PUBEKA_FAKE_PROVIDERS: 'saspay',
        META_APP_ID: '123456789',
        META_APP_SECRET: 'a'.repeat(32),
      }),
      now,
    );
    expect(real).toBeInstanceOf(MetaConnector);
  });

  it('la fausse Meta est partagée entre les requêtes', () => {
    const a = createMetaConnector(env({ PUBEKA_FAKE_PROVIDERS: 'meta' }), now);
    expect(createMetaConnector(env({ PUBEKA_FAKE_PROVIDERS: 'meta' }), now)).toBe(a);
  });

  it('sans secret Meta (ni fausse Meta) → 503 provider_unavailable, jamais une valeur inventée', () => {
    expect(() => createMetaConnector(env(), now)).toThrow(
      expect.objectContaining({ code: 'provider_unavailable' }),
    );
    expect(() => createMetaConnector(env({ META_APP_ID: '123456789' }), now)).toThrow(
      expect.objectContaining({ code: 'provider_unavailable' }),
    );
  });

  it('le vrai connecteur demande l’autorisation avec la configuration « Login for Business »', () => {
    const real = createMetaConnector(
      env({
        META_APP_ID: '123456789',
        META_APP_SECRET: 'b'.repeat(32),
        META_LOGIN_CONFIG_ID: '555',
      }),
      now,
    );
    const url = new URL(real.authorizeUrl('etat', 'https://app.test/api/v1/meta/callback'));
    expect(url.origin + url.pathname).toMatch(
      /^https:\/\/www\.facebook\.com\/v[\d.]+\/dialog\/oauth$/,
    );
    expect(url.searchParams.get('client_id')).toBe('123456789');
    expect(url.searchParams.get('config_id')).toBe('555');
    expect(url.searchParams.get('state')).toBe('etat');
    // Le secret de l'application n'apparaît jamais dans l'adresse envoyée au navigateur.
    expect(url.toString()).not.toContain('b'.repeat(32));
  });
});

describe('pagePlanOf', () => {
  it('Starter sans abonnement : 1 Page, pas de période', async () => {
    const svc = new FakeClient().reply(ok([]), PLANS, ok(null));
    expect(await pagePlanOf(svc.asService(), WS)).toEqual({
      plan: 'starter',
      maxPages: 1,
      periodStart: null,
    });
  });

  it('Pro avec abonnement : 3 Pages et le début de la période en cours', async () => {
    const svc = new FakeClient().reply(
      ok([
        {
          workspace_id: WS,
          plan_code: 'pro',
          status: 'active',
          period_end: 'x',
          grace_until: null,
        },
      ]),
      PLANS,
      ok({ period_start: '2026-10-01T00:00:00.000Z' }),
    );
    expect(await pagePlanOf(svc.asService(), WS)).toEqual({
      plan: 'pro',
      maxPages: 3,
      periodStart: '2026-10-01T00:00:00.000Z',
    });
  });
});

describe('jeton chiffré', () => {
  it('sealToken chiffre avec la clé active ; loadToken le rend utilisable avec sa date d’expiration', async () => {
    const deps = metaDeps();
    const { sealed, keyId } = sealToken(deps, 'jeton-secret-de-test');
    expect(keyId).toBe('k1');
    expect(sealed).not.toContain('jeton-secret-de-test');
    const svc = new FakeClient().reply(ok([{ sealed, key_id: keyId }]));
    const expiresAt = new Date('2026-12-01T00:00:00Z');
    const token = await loadToken(svc.asService(), deps, WS, { id: 'c1', expiresAt });
    expect(token).toEqual({ accessToken: 'jeton-secret-de-test', expiresAt });
    expect(svc.calls[0]?.ops).toContainEqual(['args', { ws: WS, conn: 'c1' }]);
  });

  it('rotation : un jeton chiffré avec une ancienne clé reste lisible', async () => {
    const old = { id: 'ancienne', bytes: new Uint8Array(32).fill(9) };
    const deps = { ...metaDeps(), keys: { k1: KEY.bytes, ancienne: old.bytes } };
    const svc = new FakeClient().reply(
      ok([{ sealed: encryptToken('ancien-jeton', old), key_id: 'ancienne' }]),
    );
    expect(
      (await loadToken(svc.asService(), deps, WS, { id: 'c', expiresAt: null })).accessToken,
    ).toBe('ancien-jeton');
  });

  it('aucune ligne pour cette connexion et cet espace → not_found', async () => {
    const svc = new FakeClient().reply(ok([]));
    await expect(
      loadToken(svc.asService(), metaDeps(), WS, { id: 'c', expiresAt: null }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('une clé inconnue ne révèle rien : internal_error (500), jamais le jeton', async () => {
    const svc = new FakeClient().reply(
      ok([
        {
          sealed: encryptToken('x', { id: 'perdue', bytes: new Uint8Array(32).fill(5) }),
          key_id: 'perdue',
        },
      ]),
    );
    await expect(
      loadToken(svc.asService(), metaDeps(), WS, { id: 'c', expiresAt: null }),
    ).rejects.toMatchObject({ code: 'internal_error' });
  });
});
