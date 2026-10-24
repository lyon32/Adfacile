// Synchronisation des statuts (S17, TR-PLA-05, EC-META-08 à 10).
//
// Deux déclencheurs, une seule logique :
//  - la tâche planifiée toutes les 15 minutes (filet de sécurité des webhooks) examine toutes les campagnes publiées ;
//  - un webhook de Meta n'est qu'un SIGNAL (déjà enregistré dans l'historique, source « webhook ») : la tâche lancée par le
//    webhook ne regarde que les campagnes qui ont reçu un signal depuis leur dernière synchronisation. Un webhook n'est
//    jamais cru sur parole : on RELIT le statut chez Meta (lecture seule) puis on décide.
//
// META FAIT FOI (voir `status-decision.ts`) : chaque changement passe par la machine d'état (`applyTransition`), gardé par le
// statut lu (deux processus qui se croisent : un seul écrit). Lecture seule chez Meta : aucune dépense, aucune écriture,
// aucune relance automatique (EC-META-05). Limite de débit (EC-META-10) : on s'arrête, on garde les dernières valeurs.
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import { createLogger } from '@pubeka/shared';
import type { PlatformToken } from '@pubeka/platforms';
import type { ServiceCtx } from '../../context';
import type { CampaignStatus } from '../campaign-state';
import { loadPublishInputs } from '../publish/load-inputs';
import { loadPublishRow } from '../publish/publish-row';
import type { PublishRow } from '../publish/publish-types';
import { loadRefs } from '../publish/remote-refs';
import { applyTransition, recordStatusEvent } from '../publish/transitions';
import { metaRateLimitScope } from './meta-limits';
import { decideStatusEvent, type StatusDecisionReason } from './status-decision';
import type { SyncDeps } from './sync-deps';

const logger = createLogger({ base: { module: 'sync-statuses' } });

/** Campagnes examinées au plus par passage (une passe toutes les 15 minutes). */
export const STATUS_SYNC_BATCH = 200;
/** Un signal de Meta plus vieux que cela est ignoré par la passe « webhook » (la passe de 15 minutes le rattrape). */
export const WEBHOOK_SIGNAL_WINDOW_MS = 24 * 60 * 60_000;

/** Statuts qui existent chez Meta et qu'on suit. `stopped` et `rejected` n'avancent que par une action du client. */
const WATCHED: readonly CampaignStatus[] = ['in_review', 'active', 'paused'];

export interface StatusSyncReport {
  scanned: number;
  changed: number;
  unchanged: number;
  journaled: number;
  skipped: number;
  errors: number;
  /** Vrai si Meta a limité le débit pendant la passe : les campagnes restantes gardent leur dernière valeur. */
  rateLimited: boolean;
}

export type StatusSyncScope = 'all' | 'webhook';

function emptyReport(): StatusSyncReport {
  return {
    scanned: 0,
    changed: 0,
    unchanged: 0,
    journaled: 0,
    skipped: 0,
    errors: 0,
    rateLimited: false,
  };
}

interface Candidate {
  id: string;
  workspace_id: string;
  status_synced_at: string | null;
  meta_campaign_id: string | null;
  ad_account_id: string | null;
}

/** Campagnes qui ont reçu un signal de Meta après leur dernière synchronisation. */
async function pendingSignals(ctx: ServiceCtx): Promise<Map<string, string>> {
  const since = new Date(ctx.now().getTime() - WEBHOOK_SIGNAL_WINDOW_MS).toISOString();
  const events = unwrap<{ campaign_id: string; created_at: string }[]>(
    await ctx.svc
      .from('campaign_status_events')
      .select('campaign_id, created_at')
      .eq('source', 'webhook')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
  );
  const latest = new Map<string, string>();
  for (const event of events) {
    if (!latest.has(event.campaign_id)) latest.set(event.campaign_id, event.created_at);
  }
  return latest;
}

async function selectCandidates(
  ctx: ServiceCtx,
  scope: StatusSyncScope,
  limit: number,
): Promise<Candidate[]> {
  const rows = unwrap<Candidate[]>(
    await ctx.svc
      .from('campaigns')
      .select('id, workspace_id, status_synced_at, meta_campaign_id, ad_account_id')
      .in('status', [...WATCHED])
      .limit(1000),
  )
    .filter((row) => row.meta_campaign_id !== null)
    .map((row) => ({ ...row, status_synced_at: row.status_synced_at ?? null }));
  const signals = await pendingSignals(ctx);
  const isPending = (row: Candidate): boolean => {
    const signal = signals.get(row.id);
    return signal !== undefined && (row.status_synced_at === null || signal > row.status_synced_at);
  };
  const chosen = scope === 'webhook' ? rows.filter(isPending) : rows;
  // D'abord celles qui ont reçu un signal, puis celles jamais synchronisées, puis les plus anciennes.
  chosen.sort((a, b) => {
    const pa = isPending(a) ? 0 : 1;
    const pb = isPending(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.status_synced_at === b.status_synced_at) return 0;
    if (a.status_synced_at === null) return -1;
    if (b.status_synced_at === null) return 1;
    return a.status_synced_at < b.status_synced_at ? -1 : 1;
  });
  return chosen.slice(0, limit);
}

/** Écrit l'heure de dernière synchronisation (sans changer la version : migration 0015). */
async function markSynced(
  ctx: ServiceCtx,
  row: Pick<PublishRow, 'id' | 'workspace_id'>,
): Promise<void> {
  const written = await ctx.svc
    .from('campaigns')
    .update({ status_synced_at: ctx.now().toISOString() })
    .eq('workspace_id', row.workspace_id)
    .eq('id', row.id);
  if (written.error !== null) throw new AppError('internal_error', { cause: written.error });
}

/** Journalise une différence qu'on n'applique pas, une seule fois tant que Meta répond la même chose. */
async function journalOnce(
  ctx: ServiceCtx,
  row: PublishRow,
  rawStatus: string,
  reason: StatusDecisionReason,
): Promise<boolean> {
  const last = unwrap<{ payload: unknown }[]>(
    await ctx.svc
      .from('campaign_status_events')
      .select('payload')
      .eq('workspace_id', row.workspace_id)
      .eq('campaign_id', row.id)
      .eq('source', 'poll')
      .order('id', { ascending: false })
      .limit(1),
  )[0];
  const payload: unknown = last?.payload;
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'raw_status' in payload &&
    'reason' in payload &&
    payload.raw_status === rawStatus &&
    payload.reason === reason
  ) {
    return false;
  }
  await recordStatusEvent(ctx.svc, row, 'meta_status', 'poll', { raw_status: rawStatus, reason });
  return true;
}

type Outcome = 'changed' | 'unchanged' | 'journaled' | 'skipped';

async function syncOne(
  ctx: ServiceCtx,
  deps: SyncDeps,
  candidate: Candidate,
  tokens: Map<string, Promise<PlatformToken>>,
): Promise<Outcome> {
  const row = await loadPublishRow(ctx.svc, candidate.workspace_id, candidate.id);
  if (!WATCHED.includes(row.status)) return 'skipped';
  const inputs = await loadPublishInputs(ctx.svc, row.workspace_id, row, ctx.now());
  if (inputs.adAccount === null || inputs.connection === null) return 'skipped';
  if (inputs.connection.status === 'expired' || inputs.connection.status === 'revoked') {
    throw new AppError('meta_token_expired');
  }
  const refs = await loadRefs(ctx.svc, row, inputs.adAccount.metaAdAccountId);
  if (refs === null) return 'skipped';

  const connectionId = inputs.connection.id;
  const connection = inputs.connection;
  let token = tokens.get(connectionId);
  if (token === undefined) {
    token = deps.loadToken(ctx.svc, row.workspace_id, connection);
    tokens.set(connectionId, token);
  }
  const remote = await deps.connector.getStatus(await token, refs);

  const today = ctx.now().toISOString().slice(0, 10);
  const decision = decideStatusEvent({
    current: row.status,
    remote,
    endDate: row.end_date,
    today,
  });

  if (decision.event === null) {
    const journaled =
      decision.reason === 'in_sync'
        ? false
        : await journalOnce(ctx, row, remote.rawStatus, decision.reason);
    await markSynced(ctx, row);
    if (decision.reason === 'in_sync') return 'unchanged';
    return journaled ? 'journaled' : 'unchanged';
  }

  const patch =
    decision.event === 'pause'
      ? { paused_at: ctx.now().toISOString() }
      : decision.event === 'resume'
        ? { paused_at: null }
        : {};
  const written = await applyTransition(ctx.svc, row, decision.event, patch);
  // Quelqu'un a agi entre la lecture et l'écriture (pause du client…) : la passe suivante relira.
  if (written === null) return 'unchanged';
  await recordStatusEvent(ctx.svc, written, written.status, 'poll', {
    raw_status: remote.rawStatus,
    event: decision.event,
    reason: decision.reason,
    from: row.status,
  });
  await markSynced(ctx, written);
  return 'changed';
}

export async function syncCampaignStatuses(
  ctx: ServiceCtx,
  deps: SyncDeps,
  options: { scope?: StatusSyncScope; limit?: number } = {},
): Promise<StatusSyncReport> {
  const limit = Math.max(1, Math.min(options.limit ?? STATUS_SYNC_BATCH, STATUS_SYNC_BATCH));
  const candidates = await selectCandidates(ctx, options.scope ?? 'all', limit);
  const report = emptyReport();
  const tokens = new Map<string, Promise<PlatformToken>>();
  const blockedAdAccounts = new Set<string>();

  for (const candidate of candidates) {
    report.scanned += 1;
    try {
      const adAccountKey = candidate.ad_account_id;
      if (adAccountKey !== null && blockedAdAccounts.has(adAccountKey)) {
        report.skipped += 1;
        continue;
      }
      try {
        const outcome = await syncOne(ctx, deps, candidate, tokens);
        report[outcome] += 1;
      } catch (error) {
        const scope = metaRateLimitScope(error);
        if (scope === null) throw error;
        // EC-META-10 : on n'insiste pas. Les dernières valeurs restent affichées, la passe suivante reprendra.
        report.rateLimited = true;
        if (scope === 'app') {
          report.skipped += candidates.length - report.scanned + 1;
          break;
        }
        if (adAccountKey !== null) blockedAdAccounts.add(adAccountKey);
        report.skipped += 1;
      }
    } catch (error) {
      report.errors += 1;
      logger.error('Synchronisation du statut impossible', {
        campaignId: candidate.id,
        err: error,
      });
    }
  }
  return report;
}
