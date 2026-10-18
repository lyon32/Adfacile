// Ce que l'écran « Publier » montre quand la publication n'aboutit pas (APPFLOW §8.6) : un message simple, l'action proposée et ce
// qui est arrivé au brouillon et au quota. Les codes sont ceux de la liste fermée d'API_SPEC §4. Le titre et le message d'une erreur
// connue de Meta sont déjà traduits par le serveur ; une erreur inconnue donne le message général et propose un ticket.
import { z } from 'zod';
import { ApiError } from '../../lib/api';

export type PublishFailureKind =
  | 'liability'
  | 'no_payment_method'
  | 'reconnect'
  | 'not_connected'
  | 'quota'
  | 'page_limit'
  | 'fields'
  | 'budget_too_low'
  | 'visual_expired'
  | 'total_changed'
  | 'in_progress'
  | 'already_published'
  | 'account_currency'
  | 'fx_not_available'
  | 'rate_limited'
  | 'read_only'
  | 'meta_known'
  | 'unknown';

export interface PublishFailure {
  kind: PublishFailureKind;
  /** Titre et message de Meta, traduits côté serveur (erreurs connues seulement). */
  metaTitle?: string;
  metaMessage?: string;
  /** Nouveau total en monnaie locale (kind `total_changed`). */
  newTotal?: { amount_minor: number; currency: string; usd_cents: number } | null;
  /** Champs à corriger (kind `fields`). */
  fields?: { field: string; message: string }[];
  /** Date à partir de laquelle la Page sera utilisable (kind `page_limit`). */
  availableFrom?: string | null;
  /** Le résultat chez Meta était incertain (la vérification a été faite avant de conclure). */
  uncertain?: boolean;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const NewTotalSchema = z.object({
  amount_minor: z.number(),
  currency: z.string(),
  usd_cents: z.number(),
});

function newTotalOf(value: unknown): PublishFailure['newTotal'] {
  if (value === null) return null;
  const parsed = NewTotalSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

interface FieldIssue {
  field: string;
  message: string;
}

/** Un code de la liste fermée (avec le `meta` du serveur) en un cas d'écran. */
function failureOf(
  code: string,
  meta: Record<string, unknown>,
  issues: readonly FieldIssue[],
): PublishFailure {
  const metaTitle = text(meta.title);
  const metaMessage = text(meta.message);
  switch (code) {
    case 'validation_failed': {
      const fields = issues.map((e) => ({ field: e.field, message: e.message }));
      return fields.some((f) => f.field === 'accept_liability')
        ? { kind: 'liability' }
        : { kind: 'fields', fields };
    }
    case 'meta_payment_method_missing':
      return {
        kind: 'no_payment_method',
        ...(metaTitle ? { metaTitle } : {}),
        ...(metaMessage ? { metaMessage } : {}),
      };
    case 'meta_token_expired':
      return { kind: 'reconnect' };
    case 'meta_not_connected':
      return { kind: 'not_connected' };
    case 'campaign_quota_reached':
      return { kind: 'quota' };
    case 'page_limit_reached': {
      const from = meta.available_from;
      return { kind: 'page_limit', availableFrom: typeof from === 'string' ? from : null };
    }
    case 'budget_too_low':
      return { kind: 'budget_too_low' };
    case 'gone':
      return { kind: 'visual_expired' };
    case 'already_published':
      return { kind: 'already_published' };
    case 'rate_limited':
      return { kind: 'rate_limited' };
    case 'workspace_read_only':
    case 'workspace_suspended':
      return { kind: 'read_only' };
    case 'conflict': {
      if (meta.reason === 'fx_changed')
        return { kind: 'total_changed', newTotal: newTotalOf(meta.new_total) ?? null };
      if (meta.reason === 'publication_in_progress') return { kind: 'in_progress' };
      if (meta.reason === 'fx_not_available') return { kind: 'fx_not_available' };
      if (meta.reason === 'account_currency_unknown') return { kind: 'account_currency' };
      return { kind: 'unknown' };
    }
    case 'meta_error':
      // Erreur connue de Meta : sa traduction simple ; sinon le message général avec un ticket proposé.
      return metaTitle || metaMessage
        ? {
            kind: 'meta_known',
            ...(metaTitle ? { metaTitle } : {}),
            ...(metaMessage ? { metaMessage } : {}),
          }
        : { kind: 'unknown' };
    default:
      return { kind: 'unknown' };
  }
}

/** Une erreur de la route `publish` en un cas d'écran. */
export function failureFrom(error: unknown): PublishFailure {
  if (!(error instanceof ApiError)) return { kind: 'unknown' };
  return failureOf(error.code, error.problem?.meta ?? {}, error.problem?.errors ?? []);
}

/** L'échec définitif enregistré par la tâche sur la campagne (`publication_error`), en un cas d'écran. */
export function failureFromRecord(record: {
  code: string;
  title?: string | undefined;
  message?: string | undefined;
  uncertain?: boolean | undefined;
}): PublishFailure {
  const base = failureOf(
    record.code,
    {
      ...(record.title === undefined ? {} : { title: record.title }),
      ...(record.message === undefined ? {} : { message: record.message }),
    },
    [],
  );
  return record.uncertain === true ? { ...base, uncertain: true } : base;
}
