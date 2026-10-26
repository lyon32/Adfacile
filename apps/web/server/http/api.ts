// Enveloppe commune des routes /api/v1 (LLD §6.1). Une route = `api({ … }, handler)` + un cas
// d'usage de @pubeka/core. Ordre fixe des contrôles (ne pas le changer) :
// request_id → maintenance → Origin → session → appartenance → rôle → espace modifiable →
// limite de débit → idempotence → validation → handler.
// Toute exception qui n'est pas une `AppError` devient `500 internal_error`, journalisée
// avec le request_id.
import { AppError } from '@pubeka/contracts';
import type { Ctx, Locale, MemberCtx, MemberRole, ServiceCtx, WorkspaceAccess } from '@pubeka/core';
import type { DbClient, ServiceClient } from '@pubeka/db';
import { isUuid } from '@pubeka/shared';
import type { z } from 'zod';
import {
  bodyHash,
  withIdempotency,
  type IdempotencyStore,
  type StoredResponse,
} from './idempotency';
import { normalizeInput } from './normalize';
import { isForbiddenOrigin, isWriteMethod } from './origin-check';
import { fieldError, fromZodError, problem, problemBody } from './problem';
import {
  enforceRateLimit,
  rateLimitHeaders,
  type RateLimitGroup,
  type RateLimiter,
  type RateLimitState,
} from './rate-limit';
import { sseHeaders } from './sse';

export type WebhookProvider = 'saspay' | 'meta' | 'higgsfield' | 'fal' | 'byteplus' | 'resend';

export type Access =
  | { auth: 'none' } // /public/*
  | { auth: 'user' } // /me, /notifications
  // `writable: true` : refusé en grâce, verrouillé, lecture seule ET suspension (seul `active` écrit). `'not_suspended'` : actions ✱ d'argent (paiement, preuve de paiement),
  // permises en lecture seule mais refusées en suspension (SECURITY_NOTES §2.1, décision 4). Sans `writable` : lecture, pause, support.
  // `allowLocked: true` : la route reste permise quand l'espace est VERROUILLÉ (essai terminé sans abonnement, ou grâce écoulée) : pause,
  // lecture de l'espace pour afficher l'écran de verrouillage. Toute autre route renvoie `403 workspace_locked`, lecture comprise
  // (décision de la personne du 26/10/2026). `writable: 'not_suspended'` (paiement, preuve de paiement) l'implique.
  | {
      auth: 'member';
      roles?: readonly MemberRole[];
      writable?: boolean | 'not_suspended';
      allowLocked?: boolean;
    } // /workspaces/{ws}/…
  | { auth: 'admin' } // /admin/* (aal2, sinon 404)
  | { auth: 'webhook'; provider: WebhookProvider };

export type RouteOptions<B extends z.ZodType, Q extends z.ZodType> = Access & {
  body?: B;
  query?: Q;
  /** Exige `Idempotency-Key` (API_SPEC §7) ; seulement sur une route d'espace. */
  idempotent?: boolean;
  /** `none` réservé aux webhooks (le fournisseur réessaie ; la signature fait foi). */
  rateLimit: RateLimitGroup | 'none';
  /** Accepte `Accept: text/event-stream` (API_SPEC §10). */
  stream?: boolean;
  /** Seul `/public/maintenance` répond pendant la maintenance (EC-ADM-02). */
  ignoreMaintenance?: boolean;
};

export type ApiResult =
  | { status: 200 | 201 | 202; body: unknown; location?: string }
  | { status: 204 }
  | { status: 302; location: string }
  | { stream: ReadableStream<Uint8Array> };

export type CtxFor<A extends Access> = A extends { auth: 'member' }
  ? MemberCtx
  : A extends { auth: 'user' } | { auth: 'admin' }
    ? Ctx
    : ServiceCtx;

export interface HandlerInput<B extends z.ZodType, Q extends z.ZodType> {
  body: z.infer<B>;
  query: z.infer<Q>;
  params: Record<string, string>;
  /** Le client a demandé un flux et la route l'accepte. */
  wantsStream: boolean;
  /** Corps brut du Request (webhooks : la signature se vérifie sur ces octets). */
  rawBody: string;
  headers: Headers;
}

export interface AuthUser {
  id: string;
  email: string;
  locale: Locale;
  timezone: string;
}

export type Authentication =
  { kind: 'ok'; user: AuthUser; db: DbClient } | { kind: 'none' } | { kind: 'expired' };

export interface ApiDeps {
  appUrl: string;
  svc: ServiceClient;
  now: () => Date;
  newRequestId: () => string;
  isMaintenance: () => Promise<boolean>;
  authenticate: (req: Request) => Promise<Authentication>;
  membership: (
    db: DbClient,
    userId: string,
    workspaceId: string,
  ) => Promise<{ role: MemberRole; access: WorkspaceAccess } | null>;
  isAdmin: (req: Request, user: AuthUser) => Promise<boolean>;
  rateLimiter: RateLimiter;
  idempotency: IdempotencyStore;
  reportError: (err: unknown, fields: { requestId: string; path: string }) => void;
}

/** Taille maximale d'un corps JSON (SECURITY_NOTES §3.1 règle 6). */
export const MAX_BODY_BYTES = 1024 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

function requestLocale(req: Request, fallback: Locale): Locale {
  const first = req.headers.get('accept-language')?.split(',')[0]?.trim().slice(0, 2);
  return first === 'en' || first === 'fr' ? first : fallback;
}

async function readBody(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new AppError('file_too_large');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new AppError('file_too_large');
  return raw;
}

function parseJson(raw: string): unknown {
  if (raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw fieldError('body', 'invalid_format', 'JSON invalide');
  }
}

function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}

function toStored(result: ApiResult): StoredResponse {
  if ('stream' in result) throw new Error('Un flux ne peut pas être rejoué (idempotence)');
  if (result.status === 204) return { status: 204, body: null };
  if (result.status === 302) return { status: 302, body: { location: result.location } };
  return { status: result.status, body: result.body };
}

function jsonResponse(status: number, body: unknown, headers: Headers): Response {
  if (status === 204) return new Response(null, { status, headers });
  if (status >= 400) headers.set('content-type', 'application/problem+json');
  else headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

/** Contrôle de l'état de l'espace (SECURITY_NOTES §2.1) : voir `Access`. */
function assertAccess(
  access: WorkspaceAccess,
  options: { writable?: boolean | 'not_suspended'; allowLocked?: boolean },
): void {
  const money = options.writable === 'not_suspended';
  if (access === 'suspended' && (options.writable === true || money)) {
    throw new AppError('workspace_suspended');
  }
  if (access === 'locked' && !money && options.allowLocked !== true) {
    throw new AppError('workspace_locked');
  }
  if (options.writable === true && access !== 'active') {
    throw new AppError('workspace_read_only');
  }
}

export function createApi(getDeps: () => ApiDeps) {
  return function api<
    const A extends Access,
    B extends z.ZodType = z.ZodUndefined,
    Q extends z.ZodType = z.ZodUndefined,
  >(
    options: RouteOptions<B, Q> & A,
    handler: (ctx: CtxFor<A>, input: HandlerInput<B, Q>) => Promise<ApiResult>,
  ): (req: Request, segment?: { params: Promise<Record<string, string>> }) => Promise<Response> {
    return async (req, segment) => {
      const deps = getDeps();
      // 1. request_id
      const requestId = deps.newRequestId();
      const url = new URL(req.url);
      const path = url.pathname;
      let locale: Locale = requestLocale(req, 'fr');
      const headers = new Headers(SECURITY_HEADERS);
      headers.set('x-request-id', requestId);
      headers.set('cache-control', 'no-store');

      try {
        const params = segment ? await segment.params : {};
        const auth = options.auth;

        // 2. maintenance (EC-ADM-02 : /public/maintenance, /admin/* et webhooks continuent)
        const exempt = options.ignoreMaintenance === true || auth === 'admin' || auth === 'webhook';
        if (!exempt && (await deps.isMaintenance())) {
          throw new AppError('maintenance', { retryAfterS: 300 });
        }

        // 3. Origin (écriture avec cookie)
        if (auth !== 'webhook' && auth !== 'none' && isForbiddenOrigin(req, deps.appUrl)) {
          throw new AppError('forbidden');
        }

        // 4. session
        let user: AuthUser | undefined;
        let db: DbClient | undefined;
        if (auth === 'user' || auth === 'member' || auth === 'admin') {
          const result = await deps.authenticate(req);
          if (result.kind !== 'ok') {
            if (auth === 'admin') throw new AppError('not_found');
            throw new AppError(result.kind === 'expired' ? 'session_expired' : 'unauthenticated');
          }
          user = result.user;
          db = result.db;
          locale = requestLocale(req, user.locale);
          if (auth === 'admin' && !(await deps.isAdmin(req, user))) {
            throw new AppError('not_found');
          }
        }

        // 5-7. appartenance, rôle, espace modifiable
        let workspace: MemberCtx['workspace'] | undefined;
        if (options.auth === 'member' && user !== undefined && db !== undefined) {
          const workspaceId = params.workspaceId ?? '';
          if (!isUuid(workspaceId)) {
            throw fieldError('workspaceId', 'invalid_format', 'UUID attendu');
          }
          const member = await deps.membership(db, user.id, workspaceId);
          // Autre espace : 404, jamais 403 (API_SPEC §2.2 règle 3).
          if (member === null) throw new AppError('not_found');
          if (options.roles !== undefined && !options.roles.includes(member.role)) {
            throw new AppError('role_insufficient');
          }
          assertAccess(member.access, options);
          workspace = { id: workspaceId, role: member.role, access: member.access };
        }

        // 8. limite de débit
        let limitState: RateLimitState | undefined;
        if (options.rateLimit !== 'none') {
          limitState = await enforceRateLimit(deps.rateLimiter, options.rateLimit, {
            ip: clientIp(req),
            userId: user?.id,
            workspaceId: workspace?.id,
          });
          for (const [k, v] of Object.entries(rateLimitHeaders(limitState))) headers.set(k, v);
        }

        // Corps : 1 Mo au plus, JSON valide.
        const rawBody = isWriteMethod(req.method) ? await readBody(req) : '';
        const parsedBody = auth === 'webhook' ? undefined : parseJson(rawBody);

        const ctxBase = { requestId, svc: deps.svc, now: deps.now };
        const ctx =
          user !== undefined && db !== undefined
            ? { ...ctxBase, user, db, ...(workspace === undefined ? {} : { workspace }) }
            : ctxBase;

        const accept = req.headers.get('accept') ?? '';
        const wantsStream = options.stream === true && accept.includes('text/event-stream');

        // 10. validation, puis handler
        const execute = async (): Promise<ApiResult> => {
          let body: unknown = undefined;
          if (options.body !== undefined) {
            const input = normalizeInput(parsedBody);
            const r = options.body.safeParse(input);
            if (!r.success) throw fromZodError(r.error, input);
            body = r.data;
          }
          let query: unknown = undefined;
          if (options.query !== undefined) {
            const input = normalizeInput(queryObject(url));
            const r = options.query.safeParse(input);
            if (!r.success) throw fromZodError(r.error, input);
            query = r.data;
          }
          // `ctx` est construit selon `options.auth` ci-dessus : forme garantie par CtxFor<A>.
          return handler(ctx as CtxFor<A>, {
            body: body as z.infer<B>,
            query: query as z.infer<Q>,
            params,
            wantsStream,
            rawBody,
            headers: req.headers,
          });
        };

        // 9. idempotence
        if (options.idempotent === true) {
          if (workspace === undefined) throw new Error('idempotent exige auth: member');
          const key = req.headers.get('idempotency-key') ?? '';
          if (!isUuid(key)) {
            throw fieldError(
              'Idempotency-Key',
              key === '' ? 'required' : 'invalid_format',
              'UUID v4 attendu',
            );
          }
          const stored = await withIdempotency(
            deps.idempotency,
            {
              workspaceId: workspace.id,
              key,
              route: `${req.method} ${path}`.slice(0, 200),
              bodyHash: bodyHash(parsedBody ?? null),
            },
            async () => toStored(await execute()),
            (err) => ({ status: err.status, body: problemBody(err, { path, requestId }) }),
          );
          if (stored.replayed) headers.set('idempotent-replayed', 'true');
          return jsonResponse(stored.status, stored.body, headers);
        }

        const result = await execute();
        if ('stream' in result) {
          for (const [k, v] of Object.entries(sseHeaders(requestId))) headers.set(k, v);
          return new Response(result.stream, { status: 200, headers });
        }
        if (result.status === 302) {
          headers.set('location', result.location);
          return new Response(null, { status: 302, headers });
        }
        if (result.status === 204) return new Response(null, { status: 204, headers });
        if (result.location !== undefined) headers.set('location', result.location);
        return jsonResponse(result.status, result.body, headers);
      } catch (err) {
        if (err instanceof AppError) {
          return problem(err, { path, requestId, locale, headers });
        }
        deps.reportError(err, { requestId, path });
        return problem(new AppError('internal_error'), { path, requestId, locale, headers });
      }
    };
  };
}
