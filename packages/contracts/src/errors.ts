// Liste fermée des codes d'erreur et de leur statut HTTP (API_SPEC §4, LLD §6.2).
// `ErrorCode` vient de l'énumération d'openapi.yaml (types générés) : un code ajouté
// d'un seul côté ne compile pas (`satisfies Record<ErrorCode, number>`).
import type { components } from './generated/openapi';

export type ErrorCode = components['schemas']['ErrorCode'];
export type FieldError = components['schemas']['FieldError'];
export type Problem = components['schemas']['Problem'];

export const ERROR_STATUS = {
  validation_failed: 400,
  unauthenticated: 401,
  session_expired: 401,
  webhook_signature_invalid: 401,
  insufficient_credits: 402,
  campaign_quota_reached: 402,
  page_limit_reached: 402,
  member_limit_reached: 402,
  plan_feature_locked: 402,
  forbidden: 403,
  role_insufficient: 403,
  workspace_read_only: 403,
  workspace_suspended: 403,
  mfa_required: 403,
  trial_already_used: 403,
  not_found: 404,
  conflict: 409,
  already_published: 409,
  idempotency_key_reused: 409,
  gone: 410,
  file_too_large: 413,
  unsupported_file_type: 415,
  illegal_product: 422,
  source_unreadable: 422,
  unsafe_url: 422,
  budget_too_low: 422,
  meta_not_connected: 424,
  meta_token_expired: 424,
  meta_payment_method_missing: 424,
  rate_limited: 429,
  daily_generation_cap: 429,
  internal_error: 500,
  meta_error: 502,
  payment_provider_error: 502,
  provider_unavailable: 503,
  maintenance: 503,
} as const satisfies Record<ErrorCode, number>;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as readonly ErrorCode[];

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_STATUS, value);
}

/** Clé de traduction du message (`domaine.ecran.element`) ; @pubeka/i18n n'est pas importable ici (LLD §3). */
export type DetailKey = string;

export interface AppErrorOptions {
  detailKey?: DetailKey;
  detailVars?: Record<string, string | number>;
  errors?: FieldError[];
  meta?: Record<string, unknown>;
  retryAfterS?: number;
  cause?: unknown;
}

/** Seule erreur renvoyée au client : convertie en Problem Details par `problem()` (S05). */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly opts: AppErrorOptions = {},
  ) {
    super(code, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

/** URL stable du type d'erreur : `https://pubeka.com/errors/<code-avec-tirets>` (API_SPEC §3.1). */
export function errorTypeUrl(code: ErrorCode): string {
  return `https://pubeka.com/errors/${code.replaceAll('_', '-')}`;
}

/** Titre anglais stable, pour les journaux (API_SPEC §3.1). */
export function errorTitle(code: ErrorCode): string {
  const words = code.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
