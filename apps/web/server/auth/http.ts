// Enveloppe des actions de connexion (POST /auth/*). Ce ne sont pas des routes de /api/v1
// (Supabase Auth porte le contrat) : même protection d'Origin qu'API_SPEC §2.2, corps validé
// par un schéma Zod strict, erreurs d'enveloppe au format Problem Details avec un code de la
// liste fermée. L'issue métier (`outcome`) est renvoyée en JSON.
import { AppError, ERROR_STATUS, type ErrorCode } from '@pubeka/contracts';
import type { z } from 'zod';
import type { ActionResult } from './actions';

export function problemResponse(code: ErrorCode, retryAfterS?: number): Response {
  const status = ERROR_STATUS[code];
  return Response.json(
    { type: `https://pubeka.com/errors/${code}`, title: code, status, code },
    {
      status,
      headers: {
        'content-type': 'application/problem+json',
        ...(retryAfterS === undefined ? {} : { 'retry-after': String(retryAfterS) }),
      },
    },
  );
}

const OUTCOME_STATUS: Record<ActionResult['outcome'], number> = {
  ok: 200,
  invalid_credentials: 401,
  locked: 429,
  email_not_confirmed: 403,
  captcha_failed: 400,
  email_taken: 409,
  weak_password: 400,
  rate_limited: 429,
  link_expired: 410,
  unavailable: 503,
};

export function resultResponse(result: ActionResult): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (result.retryAfterS !== undefined) headers['retry-after'] = String(result.retryAfterS);
  return Response.json(
    {
      outcome: result.outcome,
      ...(result.retryAfterS === undefined ? {} : { retry_after_s: result.retryAfterS }),
    },
    { status: OUTCOME_STATUS[result.outcome], headers },
  );
}

/** Origine autorisée = celle de l'application (CSRF : cookies SameSite + en-tête Origin). */
export function isAllowedOrigin(request: Request, appUrl: string): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(appUrl).origin;
}

/** Première adresse de x-forwarded-for (posée par Vercel), sinon « inconnue ». */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

export interface ActionOptions<S extends z.ZodType> {
  appUrl: () => string;
  schema: S;
}

/** Gestionnaire POST : Origin → corps JSON valide → action → réponse. */
export function authAction<S extends z.ZodType>(
  opts: ActionOptions<S>,
  run: (body: z.infer<S>, request: Request) => Promise<ActionResult>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!isAllowedOrigin(request, opts.appUrl())) return problemResponse('forbidden');
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return problemResponse('validation_failed');
    }
    const parsed = opts.schema.safeParse(raw);
    if (!parsed.success) return problemResponse('validation_failed');
    try {
      return resultResponse(await run(parsed.data, request));
    } catch (error) {
      if (error instanceof AppError) return problemResponse(error.code, error.opts.retryAfterS);
      return problemResponse('provider_unavailable');
    }
  };
}
