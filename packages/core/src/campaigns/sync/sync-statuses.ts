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
import { recordRejection } from '../rejections/record-rejection';
import type { ReadBudget } from '../rejections/read-budget';
import { loadCampaignAds, reviewAds } from '../rejections/review-ads';
import { applyTransition, recordStatusEvent } from '../publish/transitions';
import { metaRateLimitScope } from './meta-limits';
import { decideStatusEvent, type StatusDecisionReason } from './status-decision';
import type { SyncDeps } from './sync-deps';

const logger = createLogger({ base: { module: 'sync-statuses' } });

/** Campagnes examinées au plus par passage (une passe toutes les 15 minutes). */
export const STATUS_SYNC_BATCH = 200;
/** Un signal de Meta plus vieux que cela est ignoré par la passe « webhook » (la passe de 15 minutes le rattrape). */
/**
 * Lectures de refus (`fetchRejection`) au plus par passe, en plus du statut : une passe de 200 campagnes ne doit pas doubler les
 * appels vers Meta (limite de débit, EC-META-10). Le reste est lu à la passe suivante ; une limite de Meta arrête la passe.
 */
export const REJECTION_READS_PER_PASS = 40;
export const WEBHOOK_SIGNAL_WINDOW_MS = 24 * 60 * 60_000;

/** Statuts qui existent chez Meta et qu'on suit. `stopped` et `rejected` n'avancent que par une action du client. */
const WATCHED: readonly CampaignStatus[] = ['in_review', 'active', 'paused'];
/** Une campagne en erreur n'est suivie que si elle a des identifiants chez Meta (filtre de la requête) : elle peut y vivre et dépenser. */
/**
 * Statuts examinés par la passe. `rejected` y figure pour UNE raison (S18) : s'assurer que le refus a son rapport (si
 * l'enregistrement du refus avait échoué, la passe suivante le rattrape). Sans refus manquant, aucun appel à Meta n'est fait.
 */
const EXAMINED: readonly CampaignStatus[] = [...WATCHED, 'rejected', 'error'];

export interface StatusSyncReport {
  scanned: number;
  changed: number;
  unchanged: number;
  journaled: number;
  skipped: number;
  errors: number;
  /** Refus de Meta enregistrés pendant la passe (le Modérateur les explique ensuite, une fois chacun). */
  rejections: number;
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
    rejections: 0,
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

/** Au plus ce nombre de campagnes « signalées » sont cherchées par identifiant (adresse de requête bornée). */
const PENDING_IDS_MAX = 100;

async function selectCandidates(
  ctx: ServiceCtx,
  scope: StatusSyncScope,
  limit: number,
): Promise<Candidate[]> {
  // Le TRI et la LIMITE se font dans la base : jamais synchronisées d'abord, puis les plus anciennes (`status_synced_at` croissant,
  // nulles en premier). Lire un lot puis trier en mémoire laisserait de côté, au-delà de la limite de lignes, exactement celles qui
  // attendent depuis le plus longtemps. Les campagnes qui ont reçu un signal de Meta passent avant (requête à part, par identifiants).
  const signals = await pendingSignals(ctx);
  const ordered = () =>
    ctx.svc
      .from('campaigns')
      .select('id, workspace_id, status_synced_at, meta_campaign_id, ad_account_id')
      .in('status', [...EXAMINED])
      .not('meta_campaign_id', 'is', null)
      .order('status_synced_at', { ascending: true, nullsFirst: true });
  const clean = (rows: Candidate[]): Candidate[] =>
    rows.map((row) => ({ ...row, status_synced_at: row.status_synced_at ?? null }));
  const isPending = (row: Candidate): boolean => {
    const signal = signals.get(row.id);
    return signal !== undefined && (row.status_synced_at === null || signal > row.status_synced_at);
  };

  const signalled = [...signals.keys()].slice(0, PENDING_IDS_MAX);
  const pending =
    signalled.length === 0
      ? []
      : clean(unwrap<Candidate[]>(await ordered().in('id', signalled).limit(limit))).filter(
          isPending,
        );
  if (scope === 'webhook') return pending;

  const seen = new Set(pending.map((row) => row.id));
  const rest = clean(unwrap<Candidate[]>(await ordered().limit(limit + pending.length))).filter(
    (row) => !seen.has(row.id),
  );
  return [...pending, ...rest].slice(0, limit);
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
  report: StatusSyncReport,
  budget: ReadBudget,
): Promise<Outcome> {
  const row = await loadPublishRow(ctx.svc, candidate.workspace_id, candidate.id);
  if (!EXAMINED.includes(row.status)) return 'skipped';
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
  const accessToken = await token;

  // Campagne déjà refusée : on ne lit pas son statut (il ne changera que par une action du client) ; on s'assure seulement que
  // chaque publicité refusée a son refus enregistré, pour que le Modérateur l'explique (S18).
  if (row.status === 'rejected') {
    const caught = await catchUpRejections(ctx, deps, row, accessToken, refs, report, budget);
    // Budget épuisé : on ne marque pas la campagne comme synchronisée, elle reste en tête de la prochaine passe.
    if (!caught.exhausted) await markSynced(ctx, row);
    return caught.found ? 'changed' : 'skipped';
  }

  let remote = await deps.connector.getStatus(accessToken, refs);

  // Test A/B (EC-META-06) : Meta donne le statut d'UNE publicité. Avec plusieurs publicités, on lit chacune ; la campagne n'est
  // refusée que si TOUTES le sont. Une seule refusée : la campagne continue avec l'autre, et la publicité refusée a son rapport.
  const review = await reviewAds(ctx.svc, deps.connector, {
    workspaceId: row.workspace_id,
    campaignId: row.id,
    token: accessToken,
    refs,
    budget,
  });
  report.rejections += review.recorded.length;
  // Jamais « refusée » sur une lecture incomplète (budget épuisé) : on attend la passe suivante.
  if (
    review.multi &&
    remote.status === 'rejected' &&
    (review.incomplete || review.rejected < review.total)
  ) {
    const status =
      row.status === 'in_review' || row.status === 'active' || row.status === 'paused'
        ? row.status
        : remote.status;
    remote = { status, rawStatus: remote.rawStatus };
  }

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
  if (decision.event === 'refuse' && !review.multi) {
    // Refus de la campagne (une seule publicité) : on lit le motif chez Meta et on l'enregistre.
    const ad = (await loadCampaignAds(ctx.svc, written.workspace_id, written.id))[0] ?? null;
    const recorded = await recordRejection(ctx.svc, deps.connector, {
      workspaceId: written.workspace_id,
      campaignId: written.id,
      token: accessToken,
      refs,
      ad,
      budget,
    });
    // Budget épuisé : le refus sera retrouvé à la passe suivante (la campagne refusée est examinée).
    if (typeof recorded === 'object' && recorded?.created === true) report.rejections += 1;
  }
  await markSynced(ctx, written);
  return 'changed';
}

/** Retrouve les refus manquants d'une campagne déjà refusée. Vrai si au moins un refus a été enregistré. */
async function catchUpRejections(
  ctx: ServiceCtx,
  deps: SyncDeps,
  row: PublishRow,
  token: PlatformToken,
  refs: NonNullable<Awaited<ReturnType<typeof loadRefs>>>,
  report: StatusSyncReport,
  budget: ReadBudget,
): Promise<{ found: boolean; exhausted: boolean }> {
  const ads = await loadCampaignAds(ctx.svc, row.workspace_id, row.id);
  const targets = ads.length === 0 ? [null] : ads;
  let found = false;
  for (const ad of targets) {
    const recorded = await recordRejection(ctx.svc, deps.connector, {
      workspaceId: row.workspace_id,
      campaignId: row.id,
      token,
      refs,
      ad,
      budget,
    });
    if (recorded === 'budget_exhausted') return { found, exhausted: true };
    if (recorded?.created === true) {
      report.rejections += 1;
      found = true;
    }
  }
  return { found, exhausted: false };
}

export async function syncCampaignStatuses(
  ctx: ServiceCtx,
  deps: SyncDeps,
  options: { scope?: StatusSyncScope; limit?: number; rejectionReadBudget?: number } = {},
): Promise<StatusSyncReport> {
  const limit = Math.max(1, Math.min(options.limit ?? STATUS_SYNC_BATCH, STATUS_SYNC_BATCH));
  const candidates = await selectCandidates(ctx, options.scope ?? 'all', limit);
  const report = emptyReport();
  const tokens = new Map<string, Promise<PlatformToken>>();
  const blockedAdAccounts = new Set<string>();
  const budget: ReadBudget = { left: options.rejectionReadBudget ?? REJECTION_READS_PER_PASS };

  for (const candidate of candidates) {
    report.scanned += 1;
    try {
      const adAccountKey = candidate.ad_account_id;
      if (adAccountKey !== null && blockedAdAccounts.has(adAccountKey)) {
        report.skipped += 1;
        continue;
      }
      try {
        const outcome = await syncOne(ctx, deps, candidate, tokens, report, budget);
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
