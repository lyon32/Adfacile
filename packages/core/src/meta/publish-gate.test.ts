// Défense en profondeur de l'interrupteur de publication réelle : le garde-fou est AUSSI autour du connecteur Meta réel. Même si un
// cas d'usage l'oubliait, aucune écriture qui crée ou ACTIVE ne part vers Meta quand la publication réelle n'est pas activée.
// Le « transport » est un `fetch` compté : aucun appel réseau réel, jamais.
import { AppError } from '@pubeka/contracts';
import { MetaConnector, type PlatformToken, type PublishSpec } from '@pubeka/platforms';
import { parseEnv, type EnvSource } from '@pubeka/shared';
import { describe, expect, it } from 'vitest';
import { createFullMetaConnector } from './connector-factory';
import { guardPublishWrites } from './publish-gate';

const TOKEN: PlatformToken = { accessToken: 'jeton-de-test', expiresAt: null };
const REFS = {
  campaignId: '120000000001',
  adsetId: '120000000002',
  adId: '120000000003',
  creativeId: '120000000004',
  adAccountId: 'act_100000000001',
};
const SPEC = {} as PublishSpec;

interface Transport {
  calls: string[];
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

function transport(): Transport {
  const calls: string[] = [];
  return {
    calls,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [], success: true, id: '1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

function connector(t: Transport) {
  return new MetaConnector({
    appId: '123456789012345',
    appSecret: 'secret-de-test',
    now: () => new Date('2026-10-17T10:00:00Z'),
    fetch: t.fetch,
    allowedMediaHosts: ['cdn.test'],
  });
}

async function code(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('AppError attendue');
}

describe('guardPublishWrites — interrupteur désactivé', () => {
  it.each([
    ['createCampaign', (c: MetaConnector) => c.createCampaign(TOKEN, SPEC)],
    ['resume', (c: MetaConnector) => c.resume(TOKEN, REFS)],
    ['updateCampaign', (c: MetaConnector) => c.updateCampaign(TOKEN, REFS, {})],
  ])(
    '%s : 503 provider_unavailable / publish_disabled, AUCUN appel au transport',
    async (_n, run) => {
      const t = transport();
      const guarded = guardPublishWrites(connector(t), () => false);
      const error = await code(run(guarded));
      expect(error.code).toBe('provider_unavailable');
      expect(error.status).toBe(503);
      expect(error.opts.meta).toMatchObject({ reason: 'publish_disabled' });
      expect(t.calls).toEqual([]);
    },
  );

  it('les lectures, la pause et la suppression d’orphelins PAUSED restent permises (elles atteignent le transport)', async () => {
    const t = transport();
    const guarded = guardPublishWrites(connector(t), () => false);
    for (const [name, run] of [
      ['listAdAccounts', () => guarded.listAdAccounts(TOKEN)],
      ['listPages', () => guarded.listPages(TOKEN)],
      [
        'findCampaignsByReference',
        () => guarded.findCampaignsByReference(TOKEN, 'act_100000000001', 'pk-abc'),
      ],
      ['getStatus', () => guarded.getStatus(TOKEN, REFS)],
      ['pause', () => guarded.pause(TOKEN, REFS)],
      ['deleteCampaign', () => guarded.deleteCampaign(TOKEN, REFS)],
    ] as const) {
      const before = t.calls.length;
      await Promise.resolve(run()).catch(() => undefined);
      expect(t.calls.length, name).toBeGreaterThan(before);
    }
    // Jamais une création : aucun POST vers la collection des campagnes du compte.
    expect(t.calls.filter((c) => /^POST .*\/act_[0-9]+\/campaigns/.test(c))).toEqual([]);
  });

  it('l’autorisation est relue à CHAQUE appel', async () => {
    const t = transport();
    let allowed = false;
    const guarded = guardPublishWrites(connector(t), () => allowed);
    expect((await code(guarded.resume(TOKEN, REFS))).opts.meta).toMatchObject({
      reason: 'publish_disabled',
    });
    allowed = true;
    await Promise.resolve(guarded.resume(TOKEN, REFS)).catch(() => undefined);
    expect(t.calls.length).toBeGreaterThan(0);
  });
});

describe('guardPublishWrites — interrupteur activé', () => {
  it('resume atteint le transport (comportement inchangé)', async () => {
    const t = transport();
    const guarded = guardPublishWrites(connector(t), () => true);
    await Promise.resolve(guarded.resume(TOKEN, REFS)).catch(() => undefined);
    expect(t.calls.length).toBeGreaterThan(0);
  });
});

// Valeurs factices de la seule forme attendue : aucun vrai secret.
const KEY_32 = Buffer.alloc(32, 7).toString('base64');
function env(overrides: EnvSource = {}) {
  return parseEnv({
    NEXT_PUBLIC_APP_ENV: 'preview',
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
    META_APP_ID: '123456789',
    META_APP_SECRET: 'ab'.repeat(16),
    ...overrides,
  });
}

describe('createFullMetaConnector — le connecteur RÉEL est toujours gardé', () => {
  it('Meta réel, interrupteur absent : createCampaign et resume refusent AVANT le réseau', async () => {
    const real = createFullMetaConnector(
      env({ PUBEKA_FAKE_PROVIDERS: 'saspay,media,ai,email' }),
      () => new Date(),
    );
    expect((await code(real.createCampaign(TOKEN, SPEC))).opts.meta).toMatchObject({
      reason: 'publish_disabled',
    });
    expect((await code(real.resume(TOKEN, REFS))).opts.meta).toMatchObject({
      reason: 'publish_disabled',
    });
  });

  it('fausse Meta : jamais enveloppée (rien n’est dépensé), sans interrupteur', async () => {
    const fake = createFullMetaConnector(env({ PUBEKA_FAKE_PROVIDERS: 'meta' }), () => new Date());
    // La fausse Meta ne connaît pas cette campagne : l'erreur vient d'elle, jamais de l'interrupteur.
    const error = await code(fake.resume(TOKEN, REFS));
    expect(error.opts.meta?.reason).not.toBe('publish_disabled');
  });
});
