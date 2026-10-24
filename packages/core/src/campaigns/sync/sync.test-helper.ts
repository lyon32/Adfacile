// Monde de test des synchronisations : une campagne PUBLIÉE (tâche de publication jouée avec la FAUSSE Meta, jamais le vrai),
// donc avec ses identifiants Meta et sa publicité, en mémoire. Les taux, budgets et chiffres sont des valeurs D'ESSAI.
import { FakeMetaConnector, type DailyStats, type PlatformToken } from '@pubeka/platforms';
import { AppError } from '@pubeka/contracts';
import type { ServiceCtx } from '../../context';
import { NOW, W } from '../campaigns.test-helper';
import { publishCampaign } from '../publish/publish-campaign';
import { publishWorld, KEY_A, rowOf, type PublishWorld } from '../publish/publish.test-helper';
import { runPublication } from '../publish/run-publication';
import type { SyncDeps } from './sync-deps';

export const TOKEN: PlatformToken = { accessToken: 'jeton-de-test', expiresAt: null };
export const MIN = 60_000;
export { NOW, W, rowOf };

export interface SyncWorld {
  w: PublishWorld;
  fake: FakeMetaConnector;
  id: string;
  deps: (over?: Partial<SyncDeps>) => SyncDeps;
  ctxAt: (minutesAfter: number) => ServiceCtx;
  /** Ajoute une 2e campagne publiée dans le même monde. */
  refs: {
    campaignId: string;
    adsetId: string | null;
    adId: string | null;
    creativeId: string | null;
  };
}

/** Rend `request_stats_refresh` disponible sur la base en mémoire (même règle que la fonction SQL de la migration 0015). */
export function installRefreshRpc(w: PublishWorld): void {
  const rpc = (name: string, args: { p_workspace: string; p_campaign: string; p_now: string }) => {
    if (name !== 'request_stats_refresh') {
      return Promise.resolve({
        data: null,
        error: { code: '42883', message: 'fonction inconnue' },
      });
    }
    const row = w.db
      .rows('campaigns')
      .find((r) => r.id === args.p_campaign && r.workspace_id === args.p_workspace);
    const previous = row?.stats_refresh_requested_at;
    const open =
      row !== undefined &&
      (previous === null ||
        previous === undefined ||
        Date.parse(previous as string) <= Date.parse(args.p_now) - 5 * MIN);
    if (open) row.stats_refresh_requested_at = args.p_now;
    return Promise.resolve({ data: open, error: null });
  };
  Reflect.set(w.db, 'rpc', rpc);
}

/** Campagne publiée, en relecture chez Meta (`in_review`) ou en diffusion (`active`). */
export async function syncWorld(
  options: { activateAs?: 'active' | 'in_review'; draft?: Record<string, unknown> } = {},
): Promise<SyncWorld> {
  const w = publishWorld(options.draft === undefined ? {} : { draft: options.draft });
  const fake = new FakeMetaConnector({ activateAs: options.activateAs ?? 'in_review' });
  await publishCampaign(
    w.ctx,
    w.campaignId,
    { idempotencyKey: KEY_A, acceptLiability: true },
    w.deps,
  );
  const publishCtx: ServiceCtx = {
    requestId: 'req_PUBLISH',
    svc: w.db.asService(),
    now: () => NOW,
  };
  const outcome = await runPublication(
    publishCtx,
    { campaignId: w.campaignId, workspaceId: W },
    {
      connector: fake,
      loadToken: () => Promise.resolve(TOKEN),
      metaPublishEnabled: () => true,
    },
  );
  if (outcome.outcome !== 'accepted')
    throw new Error(`publication d'essai refusée : ${outcome.outcome}`);
  installRefreshRpc(w);
  const row = rowOf(w.db, w.campaignId);
  const ad = w.db.rows('ads').find((a) => a.campaign_id === w.campaignId);
  const refs = {
    campaignId: String(row.meta_campaign_id),
    adsetId: typeof row.meta_adset_id === 'string' ? row.meta_adset_id : null,
    adId: typeof ad?.meta_ad_id === 'string' ? ad.meta_ad_id : null,
    creativeId: null,
  };
  return {
    w,
    fake,
    id: w.campaignId,
    refs,
    deps: (over = {}) => ({
      connector: fake,
      loadToken: () => Promise.resolve(TOKEN),
      ...over,
    }),
    ctxAt: (minutesAfter) => ({
      requestId: 'req_SYNC',
      svc: w.db.asService(),
      now: () => new Date(NOW.getTime() + minutesAfter * MIN),
    }),
  };
}

/** Un jour de statistiques d'essai : 42 conversations pour 15 000 centimes de dépense au total sur les jours donnés. */
export function day(date: string, over: Partial<DailyStats> = {}): DailyStats {
  return {
    date,
    spendUsdCents: 500,
    impressions: 1000,
    reach: 800,
    clicks: 30,
    results: 6,
    resultType: 'onsite_conversion.messaging_conversation_started_7d',
    cpmUsdCents: 500,
    ctr: 3,
    frequency: 1.25,
    ...over,
  };
}

export function metaError(code: number): AppError {
  return new AppError('meta_error', { cause: new Error(`code ${String(code)}`) });
}
