// Lecture d'une analyse et forme de la réponse `Analysis` (openapi.yaml). Les données viennent de `analyses` et de la
// fiche `business_profiles` ; toutes les lectures sont filtrées par `workspace_id` (SECURITY_NOTES §2).
import type { components } from '@pubeka/contracts';
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../context';

export type AnalysisView = components['schemas']['Analysis'];

interface AnalysisRow {
  id: string;
  status: string;
  blocked_reason: string | null;
  error_code: string | null;
  business_profile_id: string | null;
  unreadable_sources: number[];
  page_id: string | null;
  user_intent: string | null;
  source_ids: string[];
  created_by: string | null;
  flags: string[];
}

/**
 * Signalements montrés à l'écran. Les autres (injection, valeur retirée, produit illégal) sont réservés à l'administration :
 * une injection est « ignorée silencieusement, enregistrée pour l'administration » (APPFLOW §8.1), jamais révélée.
 */
const PUBLIC_FLAGS = new Set([
  'MODEL_WITHOUT_VISION',
  'IMAGES_NOT_READ',
  'IMAGE_VALUES_UNVERIFIED',
  'MULTIPLE_BUSINESSES',
  'PRODUCT_NOT_DETECTED',
]);

export const ANALYSIS_COLUMNS =
  'id, status, blocked_reason, error_code, business_profile_id, unreadable_sources, page_id, user_intent, source_ids, created_by, flags';

const STATUSES = [
  'queued',
  'reading',
  'analysing',
  'questions',
  'ready',
  'blocked',
  'failed',
] as const;
type Status = (typeof STATUSES)[number];

function statusOf(value: string): Status {
  const found = STATUSES.find((s) => s === value);
  if (found === undefined) throw new AppError('internal_error', { meta: { reason: 'status' } });
  return found;
}

interface ProfileRow {
  profile: unknown;
  questions: unknown;
  answers: unknown;
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function loadAnalysis(ctx: MemberCtx, analysisId: string): Promise<AnalysisRow> {
  const found = await ctx.db
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', analysisId)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  // Autre espace ou identifiant inconnu : 404, jamais 403 (API_SPEC §2.2 règle 3).
  if (found.data === null) throw new AppError('not_found');
  return found.data;
}

export async function loadProfile(ctx: MemberCtx, row: AnalysisRow): Promise<ProfileRow | null> {
  if (row.business_profile_id === null) return null;
  const found = await ctx.db
    .from('business_profiles')
    .select('profile, questions, answers')
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', row.business_profile_id)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  return found.data;
}

export function toView(row: AnalysisRow, profile: ProfileRow | null): AnalysisView {
  const flags = [
    ...row.flags.filter((flag) => PUBLIC_FLAGS.has(flag) || flag.startsWith('SOURCE_UNREADABLE:')),
    ...row.unreadable_sources.map((index) => `SOURCE_UNREADABLE:${String(index)}`),
  ];
  const blocked = row.status === 'blocked';
  return {
    id: row.id,
    status: statusOf(row.status),
    blocked_reason: blocked ? 'illegal_product' : null,
    // Un produit refusé n'expose ni sa fiche ni ses questions : seul le refus est affiché (APPFLOW §8.1).
    profile: blocked
      ? null
      : ((profile?.profile ?? null) as Exclude<AnalysisView['profile'], undefined>),
    questions: blocked ? [] : asList<components['schemas']['Question']>(profile?.questions),
    unreadable_sources: row.unreadable_sources,
    page_id: row.page_id,
    error_code: row.error_code,
    flags,
    answers: asList<components['schemas']['Answer']>(profile?.answers),
  };
}

export async function getAnalysis(ctx: MemberCtx, analysisId: string): Promise<AnalysisView> {
  const row = await loadAnalysis(ctx, analysisId);
  return toView(row, await loadProfile(ctx, row));
}
