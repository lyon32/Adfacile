// Reprise des publications restées « en publication » (S16, tâche planifiée `campaign.reconcile`).
//
// Une publication reste « en publication » quand la tâche `campaign.publish` n'a pas pu conclure : lecture de rapprochement en
// panne ou liste coupée (`lookup_failed`, `lookup_incomplete`), état de l'activation illisible (`activation_unknown`),
// interrupteur de publication réelle désactivé, ou tâche interrompue. Sans reprise, la campagne y resterait pour toujours, avec
// le quota retenu. Cette passe REPREND ces campagnes en rejouant `runPublication`, qui ne crée jamais rien deux fois : il
// rapproche (lecture seule chez Meta), reflète l'état de Meta et n'ACTIVE qu'avec l'interrupteur activé. Règle pour chaque cas :
//   - trouvée chez Meta et déjà en diffusion → `in_review`, quota décompté ;
//   - trouvée en pause, jamais activée → activée SEULEMENT si l'interrupteur est activé, sinon elle reste en attente ;
//   - introuvable après lecture COMPLÈTE de la liste → échec net, quota rendu ;
//   - lecture incomplète ou en erreur → rien ne change, nouvelle tentative au passage suivant ;
//   - plus de 24 h sans issue → `error` (motif `reconcile_timeout`), quota rendu. Meta n'est pas modifié : une campagne qui y
//     existerait encore est à rapprocher à la main (reste à S35 : audit des campagnes orphelines).
// Bornée (au plus `limit` campagnes par passage, les plus anciennes d'abord), idempotente (les phases sont gardées en base),
// sans relance automatique d'une exécution qui plante : l'erreur est comptée et journalisée, la passe suivante réessaie.
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from '../../context';
import { failPublication } from './fail-publication';
import { loadPublishRow } from './publish-row';
import { runPublication, type RunPublicationDeps } from './run-publication';

const logger = createLogger({ base: { module: 'reconcile-publications' } });

/** Une publication plus jeune n'est pas reprise : la tâche de publication est peut-être encore en train de travailler. */
export const RECONCILE_MIN_AGE_MS = 5 * 60_000;
/** Au-delà, sans issue : la campagne passe en erreur et le quota est rendu. */
export const RECONCILE_GIVE_UP_MS = 24 * 60 * 60_000;
/** Campagnes reprises au plus par passage (une passe toutes les 10 minutes). */
export const RECONCILE_BATCH = 20;

export interface ReconcileReport {
  scanned: number;
  accepted: number;
  failed: number;
  pending: number;
  skipped: number;
  gaveUp: number;
  errors: number;
}

interface StuckRow {
  id: string;
  workspace_id: string;
  publish_started_at: string | null;
}

export async function reconcilePublications(
  ctx: ServiceCtx,
  deps: RunPublicationDeps,
  options: { limit?: number } = {},
): Promise<ReconcileReport> {
  const now = ctx.now();
  const limit = Math.max(1, Math.min(options.limit ?? RECONCILE_BATCH, RECONCILE_BATCH));
  const cutoff = new Date(now.getTime() - RECONCILE_MIN_AGE_MS).toISOString();
  const rows = unwrap<StuckRow[]>(
    await ctx.svc
      .from('campaigns')
      .select('id, workspace_id, publish_started_at')
      .eq('status', 'publishing')
      // Phase « none » : aucun appel à Meta n'a eu lieu, il n'y a rien à rapprocher (la route a déjà traité un lancement raté).
      .in('publish_phase', ['creating', 'created', 'activating'])
      .lte('publish_started_at', cutoff)
      .order('publish_started_at', { ascending: true })
      .limit(limit),
  );

  const report: ReconcileReport = {
    scanned: rows.length,
    accepted: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    gaveUp: 0,
    errors: 0,
  };
  for (const row of rows) {
    try {
      const outcome = await runPublication(
        ctx,
        { campaignId: row.id, workspaceId: row.workspace_id },
        deps,
      );
      if (outcome.outcome === 'accepted') report.accepted += 1;
      else if (outcome.outcome === 'failed') report.failed += 1;
      else if (outcome.outcome === 'skipped') report.skipped += 1;
      else if (await giveUpIfTooOld(ctx, deps, row, now)) report.gaveUp += 1;
      else report.pending += 1;
    } catch (error) {
      report.errors += 1;
      logger.error('Reprise d’une publication impossible', {
        campaignId: row.id,
        err: error,
      });
    }
  }
  return report;
}

/** Plus de 24 h sans issue, Meta toujours illisible : on conclut en erreur et on rend le quota. */
async function giveUpIfTooOld(
  ctx: ServiceCtx,
  deps: RunPublicationDeps,
  row: StuckRow,
  now: Date,
): Promise<boolean> {
  if (row.publish_started_at === null) return false;
  if (now.getTime() - new Date(row.publish_started_at).getTime() < RECONCILE_GIVE_UP_MS)
    return false;
  const latest = await loadPublishRow(ctx.svc, row.workspace_id, row.id);
  if (latest.status !== 'publishing') return false;
  const result = await failPublication(
    ctx.svc,
    deps,
    now,
    latest,
    new AppError('meta_error', { meta: { reason: 'reconcile_timeout' } }),
    { uncertain: true, backToDraft: false },
  );
  return result === 'failed';
}
