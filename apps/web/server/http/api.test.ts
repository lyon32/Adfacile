// Tests de l'enveloppe `api()` (LLD §6.1, TESTING §3.2) : ordre des contrôles, réponses
// d'erreur au format Problem Details, idempotence, limites, flux. Dépendances simulées.
import { AppError } from '@pubeka/contracts';
import type { DbClient, ServiceClient } from '@pubeka/db';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApi, MAX_BODY_BYTES, type ApiDeps, type Authentication } from './api';
import type { IdempotencyArgs, IdempotencyStore, StoredResponse } from './idempotency';
import { sseStream } from './sse';

const APP = 'http://app.localhost:5173';
const WS = '22222222-2222-4222-8222-222222222222';
const OTHER_WS = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const USER = { id: 'u1', email: 'awa@example.com', locale: 'fr' as const, timezone: 'UTC' };
const db = {} as DbClient;
const svc = {} as ServiceClient;

class MemoryIdempotency implements IdempotencyStore {
  readonly rows = new Map<string, { args: IdempotencyArgs; response?: StoredResponse }>();
  begin(args: IdempotencyArgs) {
    const row = this.rows.get(`${args.workspaceId}:${args.key}`);
    if (row === undefined) {
      this.rows.set(`${args.workspaceId}:${args.key}`, { args });
      return Promise.resolve({ kind: 'new' as const });
    }
    if (row.args.route !== args.route || row.args.bodyHash !== args.bodyHash) {
      return Promise.resolve({ kind: 'mismatch' as const });
    }
    if (row.response === undefined) return Promise.resolve({ kind: 'running' as const });
    return Promise.resolve({ kind: 'replay' as const, response: row.response });
  }
  complete(args: IdempotencyArgs, response: StoredResponse) {
    this.rows.set(`${args.workspaceId}:${args.key}`, { args, response });
    return Promise.resolve();
  }
  discard(args: IdempotencyArgs) {
    this.rows.delete(`${args.workspaceId}:${args.key}`);
    return Promise.resolve();
  }
}

interface Harness {
  deps: ApiDeps;
  steps: string[];
  auth: Authentication;
  maintenance: boolean;
  role: 'owner' | 'editor' | 'viewer' | null;
  access: 'active' | 'grace' | 'read_only' | 'suspended';
  limited: boolean;
  admin: boolean;
  reported: unknown[];
  idem: MemoryIdempotency;
}

function harness(): Harness {
  const h: Harness = {
    steps: [],
    auth: { kind: 'ok', user: USER, db },
    maintenance: false,
    role: 'owner',
    access: 'active',
    limited: false,
    admin: false,
    reported: [],
    idem: new MemoryIdempotency(),
    deps: undefined as unknown as ApiDeps,
  };
  h.deps = {
    appUrl: APP,
    svc,
    now: () => new Date('2026-10-12T09:00:00Z'),
    newRequestId: () => 'req_0123456789ABCDEF',
    isMaintenance: () => {
      h.steps.push('maintenance');
      return Promise.resolve(h.maintenance);
    },
    authenticate: () => {
      h.steps.push('session');
      return Promise.resolve(h.auth);
    },
    membership: (_db, _user, ws) => {
      h.steps.push('membership');
      if (ws !== WS || h.role === null) return Promise.resolve(null);
      return Promise.resolve({ role: h.role, access: h.access });
    },
    isAdmin: () => {
      h.steps.push('admin');
      return Promise.resolve(h.admin);
    },
    rateLimiter: (key, limit) => {
      h.steps.push(`rate:${key}`);
      return Promise.resolve(
        h.limited
          ? { allowed: false, hits: limit + 1, retryAfterS: 42 }
          : { allowed: true, hits: 1, retryAfterS: 30 },
      );
    },
    idempotency: h.idem,
    reportError: (err) => {
      h.reported.push(err);
    },
  };
  return h;
}

function req(
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Request {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { ...init.headers };
  if (method !== 'GET' && !('origin' in headers)) headers.origin = APP;
  if (!('cookie' in headers) && !('authorization' in headers)) headers.cookie = 'sb-x-auth-token=1';
  return new Request(`${APP}${path}`, { ...init, method, headers });
}

const seg = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const Body = z.strictObject({ name: z.string().min(1).max(5) });

describe('api() : ordre des contrôles', () => {
  it('suit l’ordre fixe et appelle le handler avec le contexte du membre', async () => {
    const h = harness();
    const api = createApi(() => h.deps);
    let seen: unknown;
    const route = api(
      {
        auth: 'member',
        roles: ['owner', 'editor'],
        writable: true,
        rateLimit: 'write',
        body: Body,
      },
      (ctx, input) => {
        h.steps.push('handler');
        seen = { ws: ctx.workspace, user: ctx.user.id, body: input.body };
        return Promise.resolve({ status: 201, body: { ok: true }, location: '/x' });
      },
    );
    const res = await route(
      req(`/api/v1/workspaces/${WS}/x`, { method: 'POST', body: '{"name":" Awa "}' }),
      seg({ workspaceId: WS }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toBe('/x');
    expect(res.headers.get('x-request-id')).toBe('req_0123456789ABCDEF');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('ratelimit-limit')).toBe('60');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(h.steps).toEqual([
      'maintenance',
      'session',
      'membership',
      'rate:api:write:user:u1',
      'handler',
    ]);
    expect(seen).toEqual({
      ws: { id: WS, role: 'owner', access: 'active' },
      user: 'u1',
      body: { name: 'Awa' }, // normalisé (espaces retirés) avant validation
    });
  });

  it('maintenance avant tout : 503 maintenance, sans lire la session', async () => {
    const h = harness();
    h.maintenance = true;
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'read' }, () =>
      Promise.resolve({ status: 204 }),
    );
    const res = await route(req('/api/v1/me'));
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(res.headers.get('retry-after')).toBe('300');
    const body = await json(res);
    expect(body).toMatchObject({
      type: 'https://pubeka.com/errors/maintenance',
      title: 'Maintenance',
      status: 503,
      code: 'maintenance',
      request_id: 'req_0123456789ABCDEF',
      instance: '/api/v1/me',
    });
    expect(h.steps).toEqual(['maintenance']);
  });

  it('EC-ADM-02 : /public/maintenance, admin et webhooks ignorent la maintenance', async () => {
    const h = harness();
    h.maintenance = true;
    h.admin = true;
    const api = createApi(() => h.deps);
    const ok = () => Promise.resolve({ status: 200 as const, body: {} });
    expect(
      (await api({ auth: 'none', rateLimit: 'public', ignoreMaintenance: true }, ok)(req('/p')))
        .status,
    ).toBe(200);
    expect((await api({ auth: 'admin', rateLimit: 'admin' }, ok)(req('/a'))).status).toBe(200);
    expect(
      (
        await api(
          { auth: 'webhook', provider: 'saspay', rateLimit: 'none' },
          ok,
        )(req('/w', { method: 'POST', body: 'x' }))
      ).status,
    ).toBe(200);
    expect(h.steps).not.toContain('maintenance');
  });

  it('Origin refusée avant la session : 403 forbidden', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'write' }, () =>
      Promise.resolve({ status: 204 }),
    );
    const res = await route(
      req('/api/v1/me', {
        method: 'PATCH',
        body: '{}',
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('forbidden');
    expect(h.steps).toEqual(['maintenance']);
  });

  it('jeton Bearer : pas de contrôle d’Origin', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'write' }, () =>
      Promise.resolve({ status: 204 }),
    );
    const res = await route(
      new Request(`${APP}/api/v1/me`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer abc' },
      }),
    );
    expect(res.status).toBe(204);
  });

  it('401 unauthenticated sans session, 401 session_expired avec un jeton périmé', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'read' }, () =>
      Promise.resolve({ status: 204 }),
    );
    h.auth = { kind: 'none' };
    let res = await route(req('/api/v1/me'));
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('unauthenticated');
    h.auth = { kind: 'expired' };
    res = await route(req('/api/v1/me'));
    expect((await json(res)).code).toBe('session_expired');
    expect(h.steps).not.toContain('handler');
  });

  it('404 pour un espace dont on n’est pas membre (jamais 403)', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'member', rateLimit: 'read' }, () =>
      Promise.resolve({ status: 204 }),
    );
    const res = await route(req(`/api/v1/workspaces/${OTHER_WS}`), seg({ workspaceId: OTHER_WS }));
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('not_found');
  });

  it('400 pour un identifiant d’espace mal formé', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'member', rateLimit: 'read' }, () =>
      Promise.resolve({ status: 204 }),
    );
    const res = await route(req('/api/v1/workspaces/abc'), seg({ workspaceId: 'abc' }));
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([
      { field: 'workspaceId', code: 'invalid_format', message: 'UUID attendu' },
    ]);
    const none = await route(req('/api/v1/workspaces/'));
    expect(none.status).toBe(400);
  });

  it('403 role_insufficient pour un rôle trop faible, avant la limite de débit', async () => {
    const h = harness();
    h.role = 'viewer';
    const route = createApi(() => h.deps)(
      { auth: 'member', roles: ['owner', 'editor'], rateLimit: 'write' },
      () => Promise.resolve({ status: 204 }),
    );
    const res = await route(
      req(`/api/v1/workspaces/${WS}/x`, { method: 'POST' }),
      seg({ workspaceId: WS }),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
    expect(h.steps.some((s) => s.startsWith('rate:'))).toBe(false);
  });

  it('espace en lecture seule ou suspendu : 403 sur une route writable, lecture permise', async () => {
    const h = harness();
    const api = createApi(() => h.deps);
    const write = api({ auth: 'member', writable: true, rateLimit: 'write' }, () =>
      Promise.resolve({ status: 204 }),
    );
    const read = api({ auth: 'member', rateLimit: 'read' }, () => Promise.resolve({ status: 204 }));
    const r = () => req(`/api/v1/workspaces/${WS}/x`, { method: 'POST' });
    h.access = 'read_only';
    expect((await json(await write(r(), seg({ workspaceId: WS })))).code).toBe(
      'workspace_read_only',
    );
    h.access = 'suspended';
    expect((await json(await write(r(), seg({ workspaceId: WS })))).code).toBe(
      'workspace_suspended',
    );
    expect((await read(req(`/api/v1/workspaces/${WS}/x`), seg({ workspaceId: WS }))).status).toBe(
      204,
    );
    h.access = 'grace';
    expect((await write(r(), seg({ workspaceId: WS }))).status).toBe(204);
  });

  it('429 rate_limited avec Retry-After, avant le handler', async () => {
    const h = harness();
    h.limited = true;
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'read' }, () => {
      h.steps.push('handler');
      return Promise.resolve({ status: 204 });
    });
    const res = await route(req('/api/v1/me'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(await json(res)).toMatchObject({ code: 'rate_limited', retry_after_s: 42 });
    expect(h.steps).not.toContain('handler');
  });

  it('route publique : limite comptée par adresse IP', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'none', rateLimit: 'public' }, (ctx) =>
      Promise.resolve({ status: 200, body: { requestId: ctx.requestId } }),
    );
    const res = await route(
      new Request(`${APP}/api/v1/public/plans`, {
        headers: { 'x-forwarded-for': '41.202.1.1, 10.0.0.1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ requestId: 'req_0123456789ABCDEF' });
    expect(h.steps).toEqual(['maintenance', 'rate:api:public:ip:41.202.1.1']);
  });
});

describe('api() : validation (400)', () => {
  const h = harness();
  const route = createApi(() => h.deps)(
    {
      auth: 'user',
      rateLimit: 'write',
      body: Body,
      query: z.strictObject({ limit: z.coerce.number().max(100) }),
    },
    (_ctx, input) =>
      Promise.resolve({ status: 200, body: { body: input.body, query: input.query } }),
  );

  it('champ inconnu → unknown_field ; trop long → too_long ; absent → required', async () => {
    let res = await route(
      req('/api/v1/me?limit=5', { method: 'PATCH', body: '{"name":"a","role":"owner"}' }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'role', code: 'unknown_field' }),
    ]);
    res = await route(req('/api/v1/me?limit=5', { method: 'PATCH', body: '{"name":"abcdefgh"}' }));
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'name', code: 'too_long' }),
    ]);
    res = await route(req('/api/v1/me?limit=5', { method: 'PATCH', body: '{}' }));
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'name', code: 'required' }),
    ]);
  });

  it('JSON invalide → 400 ; paramètre de requête invalide → 400', async () => {
    let res = await route(req('/api/v1/me?limit=5', { method: 'PATCH', body: '{oups' }));
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'body', code: 'invalid_format' }),
    ]);
    res = await route(req('/api/v1/me?limit=500', { method: 'PATCH', body: '{"name":"a"}' }));
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'limit', code: 'too_large' }),
    ]);
  });

  it('corps de plus de 1 Mo → 413 avant lecture du JSON', async () => {
    const big = `{"name":"${'a'.repeat(MAX_BODY_BYTES)}"}`;
    let res = await route(req('/api/v1/me', { method: 'PATCH', body: big }));
    expect(res.status).toBe(413);
    expect((await json(res)).code).toBe('file_too_large');
    res = await route(
      req('/api/v1/me', {
        method: 'PATCH',
        body: '{}',
        headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
      }),
    );
    expect(res.status).toBe(413);
  });

  it('succès : corps et requête validés', async () => {
    const res = await route(req('/api/v1/me?limit=5', { method: 'PATCH', body: '{"name":"a"}' }));
    expect(await json(res)).toEqual({ body: { name: 'a' }, query: { limit: 5 } });
  });
});

describe('api() : idempotence (API_SPEC §7)', () => {
  function setup() {
    const h = harness();
    let runs = 0;
    const route = createApi(() => h.deps)(
      { auth: 'member', writable: true, rateLimit: 'generation', idempotent: true, body: Body },
      (_ctx, { body }) => {
        runs += 1;
        if (body.name === 'fail')
          throw new AppError('insufficient_credits', { meta: { credits_missing: 4 } });
        if (body.name === 'crash') throw new Error('boom');
        return Promise.resolve({ status: 202, body: { run: runs } });
      },
    );
    const call = (body: string, key: string | null = KEY) =>
      route(
        req(`/api/v1/workspaces/${WS}/generations`, {
          method: 'POST',
          body,
          headers: key === null ? {} : { 'idempotency-key': key },
        }),
        seg({ workspaceId: WS }),
      );
    return { h, call, runs: () => runs };
  }

  it('même clé + même corps : réponse rejouée, handler exécuté une fois', async () => {
    const { call, runs, h } = setup();
    const first = await call('{"name":"a"}');
    expect(first.status).toBe(202);
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    const second = await call('{ "name" : "a" }');
    expect(second.status).toBe(202);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await json(second)).toEqual({ run: 1 });
    expect(runs()).toBe(1);
    expect(h.steps).toContain('rate:api:generation:ws:22222222-2222-4222-8222-222222222222');
  });

  it('même clé + autre corps : 409 idempotency_key_reused', async () => {
    const { call } = setup();
    await call('{"name":"a"}');
    const res = await call('{"name":"b"}');
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('idempotency_key_reused');
  });

  it('même clé encore en cours : 409 conflict avec retry_after_s', async () => {
    const { call, h } = setup();
    await h.idem.begin({
      workspaceId: WS,
      key: KEY,
      route: `POST /api/v1/workspaces/${WS}/generations`,
      bodyHash: (await import('./idempotency')).bodyHash({ name: 'a' }),
    });
    const res = await call('{"name":"a"}');
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: 'conflict', retry_after_s: 2 });
  });

  it('erreur 4xx enregistrée et rejouée ; erreur 5xx efface la clé', async () => {
    const { call, runs, h } = setup();
    const first = await call('{"name":"fail"}');
    expect(first.status).toBe(402);
    const again = await call('{"name":"fail"}');
    expect(again.status).toBe(402);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(again.headers.get('content-type')).toBe('application/problem+json');
    expect(await json(again)).toMatchObject({
      code: 'insufficient_credits',
      meta: { credits_missing: 4 },
    });
    expect(runs()).toBe(1);

    const key2 = '55555555-5555-4555-8555-555555555555';
    const crash = await call('{"name":"crash"}', key2);
    expect(crash.status).toBe(500);
    expect(h.idem.rows.has(`${WS}:${key2}`)).toBe(false);
  });

  it('clé absente ou mal formée → 400 sur Idempotency-Key', async () => {
    const { call } = setup();
    let res = await call('{"name":"a"}', null);
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'Idempotency-Key', code: 'required' }),
    ]);
    res = await call('{"name":"a"}', 'pas-une-cle');
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ field: 'Idempotency-Key', code: 'invalid_format' }),
    ]);
  });

  it('idempotent sans auth member → erreur de configuration (500)', async () => {
    const h = harness();
    const route = createApi(() => h.deps)(
      { auth: 'user', rateLimit: 'write', idempotent: true },
      () => Promise.resolve({ status: 204 }),
    );
    const res = await route(req('/api/v1/me', { method: 'POST' }));
    expect(res.status).toBe(500);
  });

  it('réponses 204 et 302 enregistrées', async () => {
    const h = harness();
    const api = createApi(() => h.deps);
    const r204 = api({ auth: 'member', rateLimit: 'write', idempotent: true }, () =>
      Promise.resolve({ status: 204 }),
    );
    const r302 = api({ auth: 'member', rateLimit: 'write', idempotent: true }, () =>
      Promise.resolve({ status: 302, location: 'https://x.example' }),
    );
    const mk = (k: string) =>
      req(`/api/v1/workspaces/${WS}/y`, { method: 'POST', headers: { 'idempotency-key': k } });
    expect((await r204(mk(KEY), seg({ workspaceId: WS }))).status).toBe(204);
    const res = await r302(mk('66666666-6666-4666-8666-666666666666'), seg({ workspaceId: WS }));
    expect(res.status).toBe(302);
    const stream = api({ auth: 'member', rateLimit: 'write', idempotent: true }, () =>
      Promise.resolve({ stream: new ReadableStream<Uint8Array>() }),
    );
    expect(
      (await stream(mk('77777777-7777-4777-8777-777777777777'), seg({ workspaceId: WS }))).status,
    ).toBe(500);
  });
});

describe('api() : réponses', () => {
  it('erreur inattendue → 500 internal_error, journalisée, sans détail', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'read' }, () => {
      throw new Error('SELECT * FROM secret');
    });
    const res = await route(req('/api/v1/me'));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('SELECT');
    expect(JSON.parse(text)).toMatchObject({
      code: 'internal_error',
      request_id: 'req_0123456789ABCDEF',
    });
    expect(h.reported).toHaveLength(1);
  });

  it('204 sans corps, 302 avec Location', async () => {
    const h = harness();
    const api = createApi(() => h.deps);
    const r204 = await api({ auth: 'user', rateLimit: 'read' }, () =>
      Promise.resolve({ status: 204 }),
    )(req('/a'));
    expect(r204.status).toBe(204);
    expect(await r204.text()).toBe('');
    const r302 = await api({ auth: 'user', rateLimit: 'read' }, () =>
      Promise.resolve({ status: 302, location: 'https://pubeka.com' }),
    )(req('/b'));
    expect(r302.status).toBe(302);
    expect(r302.headers.get('location')).toBe('https://pubeka.com');
  });

  it('flux SSE seulement si le client le demande et la route l’accepte', async () => {
    const h = harness();
    let asked: boolean | undefined;
    const route = createApi(() => h.deps)(
      { auth: 'user', rateLimit: 'ai', stream: true },
      (ctx, { wantsStream }) => {
        asked = wantsStream;
        return Promise.resolve({
          stream: sseStream(
            async (s) => {
              s.send('done', { ok: true });
              await Promise.resolve();
            },
            { path: '/s', requestId: ctx.requestId },
          ),
        });
      },
    );
    const res = await route(req('/s', { headers: { accept: 'text/event-stream' } }));
    expect(asked).toBe(true);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(await res.text()).toBe('event: done\ndata: {"ok":true}\n\n');
  });

  it('admin : 404 sans session, 404 sans droits, 200 avec droits', async () => {
    const h = harness();
    const route = createApi(() => h.deps)({ auth: 'admin', rateLimit: 'admin' }, () =>
      Promise.resolve({ status: 200, body: {} }),
    );
    h.auth = { kind: 'none' };
    expect((await route(req('/admin'))).status).toBe(404);
    h.auth = { kind: 'ok', user: USER, db };
    expect((await route(req('/admin'))).status).toBe(404);
    h.admin = true;
    expect((await route(req('/admin'))).status).toBe(200);
  });

  it('webhook : corps brut transmis tel quel, sans session ni Origin', async () => {
    const h = harness();
    let raw = '';
    const route = createApi(() => h.deps)(
      { auth: 'webhook', provider: 'meta', rateLimit: 'none' },
      (_c, input) => {
        raw = input.rawBody;
        return Promise.resolve({ status: 200, body: {} });
      },
    );
    const res = await route(new Request(`${APP}/w`, { method: 'POST', body: 'not json {' }));
    expect(res.status).toBe(200);
    expect(raw).toBe('not json {');
    expect(h.steps).toEqual([]);
  });

  it('langue : Accept-Language prioritaire, sinon celle du profil', async () => {
    const h = harness();
    h.auth = { kind: 'ok', user: { ...USER, locale: 'en' }, db };
    const route = createApi(() => h.deps)({ auth: 'user', rateLimit: 'read' }, () =>
      Promise.reject(new AppError('not_found')),
    );
    const res = await route(req('/x', { headers: { 'accept-language': 'en-US,fr;q=0.5' } }));
    expect(res.status).toBe(404);
  });
});
