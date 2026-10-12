// Tests des briques de server/http : problem(), normalisation, Origin, limites, SSE,
// idempotence (règle et magasin en base, client simulé).
import { AppError } from '@pubeka/contracts';
import type { ServiceClient } from '@pubeka/db';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  bodyHash,
  canonicalJson,
  dbIdempotencyStore,
  withIdempotency,
  type IdempotencyStore,
} from './idempotency';
import { normalizeInput, normalizeText } from './normalize';
import { hasBearer, isForbiddenOrigin, isWriteMethod } from './origin-check';
import { fieldError, fromZodError, problem, problemBody, problemTitle } from './problem';
import { enforceRateLimit, rateLimitHeaders, rateLimitKey, RATE_LIMITS } from './rate-limit';
import { formatSseEvent, sseHeaders, sseStream } from './sse';

const APP = 'http://app.localhost:5173';

describe('problem()', () => {
  it('construit exactement les champs de API_SPEC §3', async () => {
    const res = problem(
      new AppError('insufficient_credits', { meta: { credits_missing: 4 }, retryAfterS: 3 }),
      {
        path: '/api/v1/x',
        requestId: 'req_A',
      },
    );
    expect(res.status).toBe(402);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(res.headers.get('x-request-id')).toBe('req_A');
    expect(res.headers.get('retry-after')).toBe('3');
    expect(await res.json()).toEqual({
      type: 'https://pubeka.com/errors/insufficient-credits',
      title: 'Insufficient credits',
      status: 402,
      code: 'insufficient_credits',
      request_id: 'req_A',
      instance: '/api/v1/x',
      retry_after_s: 3,
      meta: { credits_missing: 4 },
    });
  });

  it('titre stable en anglais ; erreurs vides omises', () => {
    expect(problemTitle('idempotency_key_reused')).toBe('Idempotency key reused');
    const body = problemBody(new AppError('validation_failed', { errors: [] }), {
      path: '/',
      requestId: 'r',
    });
    expect(body).not.toHaveProperty('errors');
  });

  it('fromZodError : un code par sorte d’erreur, chemin avec des points', () => {
    const schema = z.strictObject({
      a: z.string().min(2),
      b: z.number().max(3),
      c: z.number().min(1),
      d: z.email(),
      e: z.enum(['x']),
      f: z.array(z.strictObject({ g: z.string() })).max(1),
      h: z.string().refine(() => false),
      i: z.number().multipleOf(2),
      j: z.union([z.string(), z.number()]),
      k: z.string(),
    });
    const r = schema.safeParse({
      a: 'x',
      b: 9,
      c: 0,
      d: 'nope',
      e: 'y',
      f: [{ g: 1 }, { g: 'ok' }],
      h: 'z',
      i: 3,
      j: true,
      k: 5,
      zz: 1,
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const err = fromZodError(r.error, {
      f: [{ g: 1 }, { g: 'ok' }],
      k: 5,
    });
    const codes = Object.fromEntries((err.opts.errors ?? []).map((e) => [e.field, e.code]));
    expect(codes).toMatchObject({
      a: 'too_short',
      b: 'too_large',
      c: 'too_small',
      d: 'invalid_format',
      e: 'invalid_value',
      f: 'too_long',
      'f.0.g': 'invalid_format',
      h: 'invalid_value',
      i: 'invalid_value',
      j: 'invalid_value',
      k: 'invalid_format',
      zz: 'unknown_field',
    });
    expect(fieldError('x', 'required', 'm').opts.errors).toEqual([
      { field: 'x', code: 'required', message: 'm' },
    ]);
    const sym = Symbol('s');
    const symErr = fromZodError(
      new z.ZodError([{ code: 'custom', path: [sym], message: 'm', input: 1 }]),
    );
    expect(symErr.opts.errors?.[0]?.field).toBe('s');
  });
});

describe('normalisation (SECURITY_NOTES §3.1)', () => {
  it('NFC, contrôles retirés sauf retour à la ligne, espaces aux bords retirés', () => {
    expect(normalizeText('  Café\u0000\u0007 \n ok\t ')).toBe('Café \n ok');
    expect(normalizeInput({ a: [' x ', 2, null], b: { c: '\u0085y' } })).toEqual({
      a: ['x', 2, null],
      b: { c: 'y' },
    });
  });
});

describe('Origin (API_SPEC §2.2 règle 4)', () => {
  it('écriture par cookie : Origin de l’application exigée ; lecture et Bearer exemptés', () => {
    const r = (method: string, headers: Record<string, string>) =>
      new Request(`${APP}/x`, { method, headers });
    expect(isWriteMethod('patch')).toBe(true);
    expect(isForbiddenOrigin(r('GET', {}), APP)).toBe(false);
    const c = { cookie: 'sb-x-auth-token=1' };
    // Sans cookie : rien d'automatique, la session répondra 401.
    expect(isForbiddenOrigin(r('POST', {}), APP)).toBe(false);
    expect(isForbiddenOrigin(r('POST', c), APP)).toBe(true);
    expect(isForbiddenOrigin(r('POST', { ...c, origin: 'https://evil.example' }), APP)).toBe(true);
    expect(isForbiddenOrigin(r('DELETE', { ...c, origin: APP }), APP)).toBe(false);
    expect(isForbiddenOrigin(r('PUT', { authorization: 'Bearer t' }), APP)).toBe(false);
    expect(hasBearer(new Headers({ authorization: 'Basic x' }))).toBe(false);
  });
});

describe('limites de débit (API_SPEC §11)', () => {
  it('clés : IP pour le public, utilisateur sinon, espace pour générations et IA', () => {
    expect(rateLimitKey('public', { ip: '1.2.3.4', userId: 'u' })).toBe('api:public:ip:1.2.3.4');
    expect(rateLimitKey('write', { ip: '1.2.3.4', userId: 'u' })).toBe('api:write:user:u');
    expect(rateLimitKey('write', { ip: '1.2.3.4' })).toBe('api:write:ip:1.2.3.4');
    expect(rateLimitKey('generation', { ip: 'i', userId: 'u', workspaceId: 'w' })).toBe(
      'api:generation:ws:w',
    );
    expect(rateLimitKey('stats_refresh', { ip: 'i', userId: 'u', extra: 'c1' })).toBe(
      'api:stats_refresh:user:u:c1',
    );
    expect(RATE_LIMITS.write).toEqual({ limit: 60, windowS: 60, scope: 'user' });
  });

  it('TR-SEC-09 : la 61ᵉ écriture de la minute → 429 avec Retry-After', async () => {
    let hits = 0;
    const limiter = (_k: string, limit: number) => {
      hits += 1;
      return Promise.resolve({ allowed: hits <= limit, hits, retryAfterS: 17 });
    };
    for (let i = 0; i < 60; i += 1)
      await enforceRateLimit(limiter, 'write', { ip: 'i', userId: 'u' });
    await expect(
      enforceRateLimit(limiter, 'write', { ip: 'i', userId: 'u' }),
    ).rejects.toMatchObject({
      code: 'rate_limited',
      opts: { retryAfterS: 17 },
    });
    const state = await enforceRateLimit(
      () => Promise.resolve({ allowed: true, hits: 1, retryAfterS: 0 }),
      'read',
      { ip: 'i' },
    );
    expect(rateLimitHeaders(state)).toEqual({
      'ratelimit-limit': '300',
      'ratelimit-remaining': '299',
      'ratelimit-reset': '0',
    });
    await expect(
      enforceRateLimit(
        () => Promise.resolve({ allowed: false, hits: 2, retryAfterS: 0 }),
        'export',
        { ip: 'i' },
      ),
    ).rejects.toMatchObject({ opts: { retryAfterS: 1 } });
  });
});

describe('SSE (API_SPEC §10)', () => {
  it('événements, puis erreur au format Problem Details et fermeture', async () => {
    const stream = sseStream(
      (s) => {
        s.send('field', { path: 'copy.headline', value: 'a\nb' });
        return Promise.reject(new AppError('meta_error'));
      },
      { path: '/p', requestId: 'req_S' },
    );
    const text = await new Response(stream).text();
    expect(text).toBe(
      'event: field\ndata: {"path":"copy.headline","value":"a\\nb"}\n\n' +
        'event: error\ndata: {"type":"https://pubeka.com/errors/meta-error","title":"Meta error","status":502,"code":"meta_error","request_id":"req_S","instance":"/p"}\n\n',
    );
  });

  it('erreur inattendue → internal_error, signalée ; nom d’événement contrôlé', async () => {
    const seen: unknown[] = [];
    const stream = sseStream(
      () => Promise.reject(new Error('x')),
      { path: '/p', requestId: 'r' },
      (e) => seen.push(e),
    );
    expect(await new Response(stream).text()).toContain('"code":"internal_error"');
    expect(seen).toHaveLength(1);
    const silent = sseStream(() => Promise.reject(new Error('x')), { path: '/p', requestId: 'r' });
    expect(await new Response(silent).text()).toContain('internal_error');
    expect(() => formatSseEvent('bad\nevent', {})).toThrow();
    expect(sseHeaders('r')['content-type']).toBe('text/event-stream; charset=utf-8');
  });
});

describe('idempotence : règle', () => {
  it('JSON canonique : clés triées, undefined ignoré', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }, null] })).toBe(
      '{"a":[{"d":2},null],"b":1}',
    );
    expect(canonicalJson(undefined)).toBe('null');
    expect(bodyHash({ a: 1, b: 2 })).toBe(bodyHash({ b: 2, a: 1 }));
    expect(bodyHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('erreur inattendue : clé effacée et erreur propagée', async () => {
    const calls: string[] = [];
    const store: IdempotencyStore = {
      begin: () => Promise.resolve({ kind: 'new' }),
      complete: () => {
        calls.push('complete');
        return Promise.resolve();
      },
      discard: () => {
        calls.push('discard');
        return Promise.resolve();
      },
    };
    const args = { workspaceId: 'w', key: 'k', route: 'r', bodyHash: 'h' };
    await expect(
      withIdempotency(
        store,
        args,
        () => Promise.reject(new AppError('meta_error')),
        () => ({ status: 0, body: null }),
      ),
    ).rejects.toMatchObject({ code: 'meta_error' });
    expect(calls).toEqual(['discard']);
  });
});

// Faux client service : enregistre les opérations, renvoie les réponses programmées.
function fakeSvc(
  responses: { data?: unknown; error?: { code?: string; message: string } | null }[],
) {
  const ops: string[][] = [];
  const next = () => {
    const r = responses.shift() ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  };
  const chain = (op: string[]): unknown => {
    ops.push(op);
    const p: Record<string, unknown> = {};
    for (const m of ['insert', 'select', 'update', 'delete', 'eq', 'maybeSingle']) {
      p[m] = (...a: unknown[]) => {
        op.push(m, ...a.map((x) => JSON.stringify(x)));
        return p;
      };
    }
    p.then = (resolve: (v: unknown) => void) => {
      resolve(next());
    };
    return p;
  };
  const svc = { from: (t: string) => chain([t]) } as unknown as ServiceClient;
  return { svc, ops };
}

describe('idempotence : magasin en base', () => {
  const args = { workspaceId: 'w', key: 'k', route: 'POST /x', bodyHash: 'h' };
  const now = () => new Date('2026-10-12T09:00:00Z');
  const row = (o: Record<string, unknown>) => ({
    route: 'POST /x',
    body_hash: 'h',
    state: 'done',
    response_status: 202,
    response_body: { a: 1 },
    expires_at: '2026-10-13T09:00:00Z',
    ...o,
  });
  const dup = { error: { code: '23505', message: 'dup' } };

  it('nouvelle clé', async () => {
    const { svc } = fakeSvc([{}]);
    await expect(dbIdempotencyStore(svc, now).begin(args)).resolves.toEqual({ kind: 'new' });
  });

  it('rejouée, en cours, empreinte différente', async () => {
    let s = fakeSvc([dup, { data: row({}) }]);
    expect(await dbIdempotencyStore(s.svc, now).begin(args)).toEqual({
      kind: 'replay',
      response: { status: 202, body: { a: 1 } },
    });
    s = fakeSvc([dup, { data: row({ state: 'running', response_status: null }) }]);
    expect(await dbIdempotencyStore(s.svc, now).begin(args)).toEqual({ kind: 'running' });
    s = fakeSvc([dup, { data: row({ body_hash: 'autre' }) }]);
    expect(await dbIdempotencyStore(s.svc, now).begin(args)).toEqual({ kind: 'mismatch' });
  });

  it('clé expirée (24 h) ou effacée entre-temps : nouvel essai', async () => {
    let s = fakeSvc([dup, { data: row({ expires_at: '2026-10-12T08:00:00Z' }) }, {}, {}]);
    expect(await dbIdempotencyStore(s.svc, now).begin(args)).toEqual({ kind: 'new' });
    expect(s.ops.some((o) => o.includes('delete'))).toBe(true);
    s = fakeSvc([dup, { data: null }, dup, { data: null }]);
    expect(await dbIdempotencyStore(s.svc, now).begin(args)).toEqual({ kind: 'running' });
  });

  it('erreurs de la base → internal_error', async () => {
    let s = fakeSvc([{ error: { code: 'XX', message: 'x' } }]);
    await expect(dbIdempotencyStore(s.svc, now).begin(args)).rejects.toMatchObject({
      code: 'internal_error',
    });
    s = fakeSvc([dup, { error: { message: 'x' } }]);
    await expect(dbIdempotencyStore(s.svc, now).begin(args)).rejects.toMatchObject({
      code: 'internal_error',
    });
    s = fakeSvc([{ error: { message: 'x' } }]);
    await expect(
      dbIdempotencyStore(s.svc, now).complete(args, { status: 200, body: {} }),
    ).rejects.toMatchObject({
      code: 'internal_error',
    });
    s = fakeSvc([{ error: { message: 'x' } }]);
    await expect(dbIdempotencyStore(s.svc, now).discard(args)).rejects.toMatchObject({
      code: 'internal_error',
    });
  });

  it('complete enregistre statut et corps JSON ; un corps non JSON est remplacé par null', async () => {
    const s = fakeSvc([{}, {}]);
    const store = dbIdempotencyStore(s.svc, now);
    await store.complete(args, { status: 202, body: { a: [1, 'x', true, null], b: undefined } });
    await store.complete(args, { status: 204, body: () => 1 });
    expect(s.ops[0]?.join(' ')).toContain('"response_status":202');
    expect(s.ops[1]?.join(' ')).toContain('"response_body":null');
  });
});
