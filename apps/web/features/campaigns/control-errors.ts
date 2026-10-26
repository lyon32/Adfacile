// Ce que la page de campagne dit quand une pause, une reprise, une relance ou une actualisation n'aboutit pas. Les codes sont ceux de
// la liste fermée (API_SPEC §4) ; le titre et le message d'une erreur de Meta sont déjà traduits par le serveur. Meta est appelé
// d'abord : un échec veut toujours dire « rien n'a changé » (EC-META-07), et l'écran le dit.
import { ApiError } from '../../lib/api';

export type ControlFailureKind =
  | 'publish_disabled'
  | 'meta_unreachable'
  | 'meta_known'
  | 'token_expired'
  | 'billing_still_failing'
  | 'payment_method'
  | 'stale'
  | 'invalid_state'
  | 'read_only'
  | 'page_limit'
  | 'rate_limited'
  | 'unknown';

export interface ControlFailure {
  kind: ControlFailureKind;
  metaTitle?: string;
  metaMessage?: string;
  retryAfterS?: number;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function controlFailureOf(error: unknown): ControlFailure {
  if (!(error instanceof ApiError)) return { kind: 'unknown' };
  const meta = error.problem?.meta ?? {};
  const metaTitle = text(meta.title);
  const metaMessage = text(meta.message);
  const known = {
    ...(metaTitle === undefined ? {} : { metaTitle }),
    ...(metaMessage === undefined ? {} : { metaMessage }),
  };
  switch (error.code) {
    case 'provider_unavailable':
      return { kind: meta.reason === 'publish_disabled' ? 'publish_disabled' : 'unknown' };
    case 'meta_token_expired':
      return { kind: 'token_expired' };
    case 'meta_not_connected':
      return { kind: 'token_expired' };
    case 'meta_payment_method_missing':
      return meta.reason === 'billing_still_failing'
        ? { kind: 'billing_still_failing', ...known }
        : { kind: 'payment_method', ...known };
    case 'meta_error':
      return metaMessage === undefined
        ? { kind: 'meta_unreachable' }
        : { kind: 'meta_known', ...known };
    case 'conflict':
      return { kind: meta.reason === 'invalid_transition' ? 'invalid_state' : 'stale' };
    case 'workspace_read_only':
    case 'workspace_suspended':
    case 'workspace_locked':
      return { kind: 'read_only' };
    case 'page_limit_reached':
      return { kind: 'page_limit' };
    case 'rate_limited':
      return {
        kind: 'rate_limited',
        ...(error.problem?.retry_after_s === undefined
          ? {}
          : { retryAfterS: error.problem.retry_after_s }),
      };
    default:
      return { kind: 'unknown' };
  }
}
