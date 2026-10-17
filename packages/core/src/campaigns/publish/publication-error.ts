// Pourquoi une publication a échoué, tel qu'il est enregistré sur la campagne (`campaigns.publish_error`) et montré à l'écran
// (APPFLOW §8.6). Ne contient QUE ce qui peut être affiché : un code de la liste fermée, le titre et le message de Meta déjà
// traduits en langage simple, jamais le message brut de Meta, un jeton ou une adresse.
import { isErrorCode, type AppError, type ErrorCode } from '@pubeka/contracts';
import type { Json } from '@pubeka/db';
import { z } from 'zod';

export const PUBLICATION_FIXES = ['destination', 'retry', 'reconnect', 'billing'] as const;
export type PublicationFix = (typeof PUBLICATION_FIXES)[number];

export interface PublicationErrorRecord {
  code: ErrorCode;
  title?: string;
  message?: string;
  fix?: PublicationFix | null;
  uncertain?: boolean;
  /** Raison courte (code en minuscules) quand l'écran doit distinguer un cas : `reconcile_timeout`, `publish_disabled`… */
  reason?: string;
  at: string;
}

const storedSchema = z.object({
  code: z.string(),
  title: z.string().max(300).optional(),
  message: z.string().max(1000).optional(),
  fix: z.enum(PUBLICATION_FIXES).nullable().optional(),
  uncertain: z.boolean().optional(),
  reason: z
    .string()
    .regex(/^[a-z_]{1,60}$/)
    .optional(),
  at: z.string(),
});

const MAX_TEXT = 500;

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.slice(0, MAX_TEXT);
}

function reasonOf(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z_]{1,60}$/.test(value) ? value : undefined;
}

function fixOf(value: unknown): PublicationFix | null {
  return PUBLICATION_FIXES.find((fix) => fix === value) ?? null;
}

/** Enregistrement affichable d'une erreur du connecteur ou de Pubeka. */
export function toPublicationError(
  error: AppError,
  at: Date,
  options: { uncertain?: boolean } = {},
): PublicationErrorRecord {
  const meta = error.opts.meta ?? {};
  const title = text(meta.title);
  const message = text(meta.message);
  const reason = reasonOf(meta.reason);
  return {
    code: error.code,
    ...(title === undefined ? {} : { title }),
    ...(message === undefined ? {} : { message }),
    fix: fixOf(meta.fix),
    ...(options.uncertain === true ? { uncertain: true } : {}),
    ...(reason === undefined ? {} : { reason }),
    at: at.toISOString(),
  };
}

/** Lecture tolérante de la colonne : une valeur illisible vaut « pas d'erreur » (jamais une exception à l'affichage). */
export function readPublicationError(value: unknown): PublicationErrorRecord | null {
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success || !isErrorCode(parsed.data.code)) return null;
  const { code, title, message, fix, uncertain, reason, at } = parsed.data;
  return {
    code,
    ...(title === undefined ? {} : { title }),
    ...(message === undefined ? {} : { message }),
    ...(fix === undefined ? {} : { fix }),
    ...(uncertain === undefined ? {} : { uncertain }),
    ...(reason === undefined ? {} : { reason }),
    at,
  };
}

export function toJson(record: PublicationErrorRecord): Json {
  return {
    code: record.code,
    ...(record.title === undefined ? {} : { title: record.title }),
    ...(record.message === undefined ? {} : { message: record.message }),
    fix: record.fix ?? null,
    ...(record.uncertain === undefined ? {} : { uncertain: record.uncertain }),
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    at: record.at,
  };
}
