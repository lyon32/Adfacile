// Bouton « Actualiser » (TR-PLA-06) : copie les statistiques MAINTENANT, au plus une fois toutes les 5 minutes par campagne.
//
// La limite est appliquée par la BASE (`request_stats_refresh`, une seule instruction : deux clics simultanés, un seul passe),
// pas par la mémoire d'un processus. Aucune dépense : on lit seulement chez Meta. La tâche est lancée avec une clé
// d'idempotence propre à la demande acceptée ; si le lancement échoue, la fenêtre est rendue pour que le client puisse réessayer.
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { JobEnqueuer } from '../../analysis/deps';
import type { MemberCtx } from '../../context';

export const SYNC_STATS_TASK = 'campaign.sync-stats';
export const REFRESH_WINDOW_S = 300;

export interface RefreshStatsResult {
  status: 'queued';
  requested_at: string;
}

export async function requestStatsRefresh(
  ctx: MemberCtx,
  campaignId: string,
  jobs: JobEnqueuer,
): Promise<RefreshStatsResult> {
  const found = await ctx.db
    .from('campaigns')
    .select('id, meta_campaign_id, stats_refresh_requested_at')
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', campaignId)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  if (found.data === null) throw new AppError('not_found');
  // Jamais publiée chez Meta : rien à copier.
  if (found.data.meta_campaign_id === null) {
    throw new AppError('conflict', { meta: { reason: 'not_published_on_meta' } });
  }
  const now = ctx.now();
  const previous = found.data.stats_refresh_requested_at;
  const accepted = unwrap(
    await ctx.svc.rpc('request_stats_refresh', {
      p_workspace: ctx.workspace.id,
      p_campaign: campaignId,
      p_now: now.toISOString(),
    }),
  );
  if (!accepted) {
    const last = previous === null ? now.getTime() : Date.parse(previous);
    const wait = Math.max(1, Math.ceil((last + REFRESH_WINDOW_S * 1000 - now.getTime()) / 1000));
    throw new AppError('rate_limited', {
      retryAfterS: wait,
      meta: { reason: 'stats_refresh_window' },
    });
  }
  const requestedAt = now.toISOString();
  try {
    await jobs.enqueue(
      SYNC_STATS_TASK,
      { campaignId, workspaceId: ctx.workspace.id },
      `${SYNC_STATS_TASK}:${campaignId}:${requestedAt}`,
    );
  } catch (cause) {
    // Le lancement a échoué : la demande n'a pas eu lieu, la fenêtre est rendue.
    await ctx.svc
      .from('campaigns')
      .update({ stats_refresh_requested_at: previous })
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', campaignId);
    throw new AppError('provider_unavailable', { cause });
  }
  return { status: 'queued', requested_at: requestedAt };
}
