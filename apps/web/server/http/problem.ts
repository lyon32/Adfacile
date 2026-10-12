// Réponse d'erreur standard : Problem Details (RFC 9457) avec les extensions Pubeka
// (API_SPEC §3, LLD §6.2). Seule sortie d'erreur de l'API : aucun autre champ, jamais de
// trace, de SQL ni de message brut d'un fournisseur (API_SPEC §3.3).
import { AppError, ERROR_STATUS, type FieldError, type Problem } from '@pubeka/contracts';
import type { z } from 'zod';

export type Locale = 'fr' | 'en';

/** Titre anglais stable, dérivé du code : `insufficient_credits` → « Insufficient credits ». */
export function problemTitle(code: AppError['code']): string {
  const words = code.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function problemBody(err: AppError, req: { path: string; requestId: string }): Problem {
  const status = ERROR_STATUS[err.code];
  const body: Problem = {
    type: `https://pubeka.com/errors/${err.code.replace(/_/g, '-')}`,
    title: problemTitle(err.code),
    status,
    code: err.code,
    request_id: req.requestId,
    instance: req.path,
  };
  // `detail` (texte traduit) arrive avec les fichiers de traduction (S09) : le client teste `code`.
  if (err.opts.errors !== undefined && err.opts.errors.length > 0) body.errors = err.opts.errors;
  if (err.opts.retryAfterS !== undefined) body.retry_after_s = err.opts.retryAfterS;
  if (err.opts.meta !== undefined) body.meta = err.opts.meta;
  return body;
}

export function problem(
  err: AppError,
  req: { path: string; requestId: string; locale?: Locale; headers?: HeadersInit },
): Response {
  const body = problemBody(err, req);
  const headers = new Headers(req.headers);
  headers.set('content-type', 'application/problem+json');
  headers.set('x-request-id', req.requestId);
  headers.set('cache-control', 'no-store');
  if (err.opts.retryAfterS !== undefined) headers.set('retry-after', String(err.opts.retryAfterS));
  return new Response(JSON.stringify(body), { status: body.status, headers });
}

/** Chemin JSON avec des points (`copy.headline`, `sources.2.url`), API_SPEC §3.2. */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.map((p) => (typeof p === 'symbol' ? (p.description ?? '') : String(p))).join('.');
}

/** Valeur reçue à un chemin (Zod 4 ne recopie pas l'entrée dans ses erreurs). */
function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = input;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function fieldCode(issue: z.core.$ZodIssue, input: unknown): FieldError['code'] {
  switch (issue.code) {
    case 'invalid_type':
      return valueAt(input, issue.path) === undefined ? 'required' : 'invalid_format';
    case 'too_big':
      return issue.origin === 'string' || issue.origin === 'array' ? 'too_long' : 'too_large';
    case 'too_small':
      return issue.origin === 'string' || issue.origin === 'array' ? 'too_short' : 'too_small';
    case 'invalid_format':
      return 'invalid_format';
    case 'unrecognized_keys':
      return 'unknown_field';
    case 'invalid_value':
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
    case 'not_multiple_of':
    case 'custom':
      return 'invalid_value';
  }
}

/** Erreur Zod → `validation_failed` avec une erreur par champ (un champ inconnu par clé). */
export function fromZodError(
  err: z.ZodError,
  input?: unknown,
  prefix: readonly PropertyKey[] = [],
): AppError {
  const errors: FieldError[] = [];
  for (const issue of err.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        errors.push({
          field: fieldPath([...prefix, ...issue.path, key]),
          code: 'unknown_field',
          message: issue.message,
        });
      }
      continue;
    }
    errors.push({
      field: fieldPath([...prefix, ...issue.path]),
      code: fieldCode(issue, input),
      message: issue.message,
    });
  }
  return new AppError('validation_failed', { errors });
}

/** Erreur sur un seul champ (en-tête, paramètre d'adresse). */
export function fieldError(field: string, code: FieldError['code'], message: string): AppError {
  return new AppError('validation_failed', { errors: [{ field, code, message }] });
}
