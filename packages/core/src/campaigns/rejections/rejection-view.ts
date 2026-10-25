// Lecture d'un refus de Meta et forme de la réponse `Rejection` (openapi.yaml). Toutes les lectures sont filtrées par
// `workspace_id` (SECURITY_NOTES §2) ; un refus d'un autre espace, ou d'une autre campagne, est introuvable (404, jamais 403).
import { isFixableCopyField, moderateurStoredSchema, type ModerateurStored } from '@pubeka/agents';
import { AppError, type components } from '@pubeka/contracts';
import type { DbClient } from '@pubeka/db';

export type RejectionView = components['schemas']['Rejection'];
export type RejectionReportView = components['schemas']['RejectionReport'];

export const REJECTION_COLUMNS =
  'id, workspace_id, campaign_id, ad_id, meta_reason, report, memory_pattern, fixed_and_republished, created_at, explain_status, explain_error';

export type ExplainStatus = 'pending' | 'running' | 'ready' | 'failed';
const EXPLAIN_STATUSES: readonly ExplainStatus[] = ['pending', 'running', 'ready', 'failed'];

export interface RejectionRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  ad_id: string | null;
  meta_reason: string | null;
  report: unknown;
  memory_pattern: string | null;
  fixed_and_republished: boolean;
  created_at: string;
  explain_status: ExplainStatus;
  explain_error: string | null;
}

type RawRow = Omit<RejectionRow, 'explain_status'> & { explain_status: string };

export function toRejectionRow(raw: RawRow): RejectionRow {
  const status = EXPLAIN_STATUSES.find((s) => s === raw.explain_status);
  if (status === undefined) {
    throw new AppError('internal_error', { meta: { reason: 'explain_status' } });
  }
  return { ...raw, explain_status: status };
}

/** Rapport enregistré, relu avec tolérance : un rapport illisible vaut « pas de rapport » (jamais une exception à l'écran). */
export function readStoredReport(value: unknown): ModerateurStored | null {
  const parsed = moderateurStoredSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface RejectionContext {
  campaignStatus: string;
  variant: 'A' | 'B' | null;
}

/** Une seule des publicités du test est refusée et la campagne continue (EC-META-06). */
export function isPartial(row: RejectionRow, context: RejectionContext): boolean {
  // La campagne « continue » (vérification, diffusion, pause) : ni refusée en entier, ni en cours de republication, ni en erreur.
  return (
    !row.fixed_and_republished &&
    row.ad_id !== null &&
    (context.campaignStatus === 'in_review' ||
      context.campaignStatus === 'active' ||
      context.campaignStatus === 'paused')
  );
}

export function toRejectionView(row: RejectionRow, context: RejectionContext): RejectionView {
  const report = row.explain_status === 'ready' ? readStoredReport(row.report) : null;
  const partial = isPartial(row, context);
  const fix = report?.fix ?? null;
  const fixApplicable =
    report !== null &&
    report.can_fix &&
    fix !== null &&
    isFixableCopyField(fix.field) &&
    !row.fixed_and_republished &&
    !partial &&
    (context.campaignStatus === 'rejected' || context.campaignStatus === 'error');
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    ad_id: row.ad_id,
    variant: context.variant,
    status: row.explain_status,
    partial,
    fixed: row.fixed_and_republished,
    meta_reason: row.meta_reason,
    report:
      report === null
        ? null
        : {
            rejection_category: report.rejection_category,
            culprit: report.culprit,
            cause_certainty: report.cause_certainty,
            can_fix: report.can_fix,
            fix: report.fix,
            appeal_recommended: report.appeal_recommended,
            report: report.report,
          },
    can_fix: report?.can_fix ?? false,
    fix_applicable: fixApplicable,
    appeal_recommended: report?.appeal_recommended ?? false,
    created_at: row.created_at,
  };
}

export async function loadRejectionRow(
  reader: DbClient,
  workspaceId: string,
  campaignId: string,
  rejectionId: string,
): Promise<RejectionRow> {
  const found = await reader
    .from('rejections')
    .select(REJECTION_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .eq('id', rejectionId)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  if (found.data === null) throw new AppError('not_found');
  return toRejectionRow(found.data);
}

/** Variante (A ou B) d'une publicité, pour l'écran d'un test A/B. */
export async function loadVariants(
  reader: DbClient,
  workspaceId: string,
  campaignId: string,
): Promise<Map<string, 'A' | 'B' | null>> {
  const found = await reader
    .from('ads')
    .select('id, variant')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId);
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  const map = new Map<string, 'A' | 'B' | null>();
  for (const ad of found.data) {
    map.set(ad.id, ad.variant === 'A' || ad.variant === 'B' ? ad.variant : null);
  }
  return map;
}
