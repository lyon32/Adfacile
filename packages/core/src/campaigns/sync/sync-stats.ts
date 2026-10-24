// Copie des statistiques de Meta dans notre base (S17, TR-PLA-06, EC-META-10).
//
// Toutes les heures pour les campagnes qui diffusent, et à la demande (bouton « Actualiser », 1 fois / 5 minutes par campagne).
// Lecture seule chez Meta : aucune dépense, aucune écriture, aucune relance automatique.
//
// Règles :
//  - Meta donne les dépenses dans la monnaie du COMPTE publicitaire. Un compte hors dollar est converti en centimes de dollar
//    avec le taux de `exchange_rates` s'il a moins de 48 h (jamais de taux inventé) ; sans taux frais, la campagne garde ses
//    dernières valeurs et `stats_sync_error = fx_not_available` ;
//  - un jour de campagne = une ligne (`stats_daily`), réécrite à chaque synchronisation : les chiffres d'un jour récent bougent
//    (attribution tardive), on relit donc les 7 derniers jours à chaque passe ;
//  - limite de débit (EC-META-10) : on s'arrête, on garde les dernières valeurs et on note `rate_limited` avec l'heure de la
//    dernière mise à jour réussie (`stats_synced_at` n'avance pas).
import { AppError } from '@pubeka/contracts';
import { unwrap, type ServiceClient } from '@pubeka/db';
import type { DailyStats, PlatformToken } from '@pubeka/platforms';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from '../../context';
import { isFxFresh } from '../../fx/freshness';
import type { CampaignStatus } from '../campaign-state';
import { loadPublishInputs } from '../publish/load-inputs';
import { loadPublishRow } from '../publish/publish-row';
import type { PublishRow } from '../publish/publish-types';
import { loadRefs } from '../publish/remote-refs';
import { accountCentsToUsdCents } from './amounts';
import { metaRateLimitScope } from './meta-limits';
import type { SyncDeps } from './sync-deps';

const logger = createLogger({ base: { module: 'sync-stats' } });

/** Campagnes copiées au plus par passage (une passe par heure). */
export const STATS_SYNC_BATCH = 100;
/** Jours relus à chaque passe (attribution tardive). */
export const STATS_REFETCH_DAYS = 7;
/** Au plus 90 jours de remontée à la première synchronisation. */
export const STATS_FIRST_SYNC_MAX_DAYS = 90;
/** Une campagne terminée ou arrêtée est relue jusqu'à 2 jours après son dernier jour, puis laissée tranquille. */
const SETTLE_DAYS = 2;

export type StatsSyncError = 'rate_limited' | 'fx_not_available' | 'meta_error' | 'token_expired';

export interface StatsSyncReport {
  scanned: number;
  synced: number;
  daysWritten: number;
  skipped: number;
  errors: number;
  rateLimited: boolean;
}

interface Candidate {
  id: string;
  workspace_id: string;
  status: string;
  end_date: string | null;
  stats_synced_at: string | null;
  meta_campaign_id: string | null;
  ad_account_id: string | null;
}

const DAY_MS = 86_400_000;

function addDaysTo(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

async function selectCandidates(ctx: ServiceCtx, limit: number): Promise<Candidate[]> {
  // Tri et limite DANS la base (jamais copiées d'abord, puis les plus anciennes) : un lot lu puis trié en mémoire laisserait de côté
  // celles qui attendent le plus. Trois requêtes simples, fusionnées (les `limit` premières de la réunion sont parmi les `limit`
  // premières de chaque requête) :
  //  - celles qui diffusent ou attendent la relecture : toujours ;
  //  - les terminées ou arrêtées jamais copiées : une fois ;
  //  - les terminées ou arrêtées dont la date de fin est dans les 2 derniers jours : leurs derniers jours peuvent encore bouger.
  // Une terminée ou arrêtée sans date de fin n'est copiée qu'une fois (pas de fenêtre qui glisse à chaque copie).
  const today = ctx.now().toISOString().slice(0, 10);
  const settleCutoff = addDaysTo(today, -SETTLE_DAYS);
  const ordered = (statuses: readonly CampaignStatus[]) =>
    ctx.svc
      .from('campaigns')
      .select(
        'id, workspace_id, status, end_date, stats_synced_at, meta_campaign_id, ad_account_id',
      )
      .in('status', [...statuses])
      .not('meta_campaign_id', 'is', null)
      .order('stats_synced_at', { ascending: true, nullsFirst: true });
  const [live, neverCopied, settling] = await Promise.all([
    ordered(['in_review', 'active', 'paused']).limit(limit),
    ordered(['ended', 'stopped']).is('stats_synced_at', null).limit(limit),
    ordered(['ended', 'stopped']).gte('end_date', settleCutoff).limit(limit),
  ]);
  const seen = new Set<string>();
  const merged: Candidate[] = [];
  for (const result of [live, neverCopied, settling]) {
    for (const row of unwrap<Candidate[]>(result)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push({ ...row, stats_synced_at: row.stats_synced_at ?? null });
    }
  }
  merged.sort((a, b) => {
    if (a.stats_synced_at === b.stats_synced_at) return 0;
    if (a.stats_synced_at === null) return -1;
    if (b.stats_synced_at === null) return 1;
    return Date.parse(a.stats_synced_at) - Date.parse(b.stats_synced_at);
  });
  return merged.slice(0, limit);
}

/** Taux frais (moins de 48 h) de la monnaie du compte, ou `null` : jamais un taux périmé ou par défaut. */
export async function freshRate(
  svc: ServiceClient,
  currency: string,
  now: Date,
): Promise<number | null> {
  const rows = await svc
    .from('exchange_rates')
    .select('rate, fetched_at, provider_updated_at')
    .eq('base', 'USD')
    .eq('quote', currency)
    .order('fetched_at', { ascending: false })
    .limit(1);
  if (rows.error !== null) throw new AppError('internal_error', { cause: rows.error });
  const latest = rows.data[0];
  return latest !== undefined && isFxFresh(latest, now) ? latest.rate : null;
}

function rangeFor(
  row: PublishRow,
  firstSync: boolean,
  now: Date,
): { since: string; until: string } {
  const today = now.toISOString().slice(0, 10);
  const published = (row.published_at ?? row.start_date ?? today).slice(0, 10);
  const earliest = addDaysTo(today, -STATS_FIRST_SYNC_MAX_DAYS);
  const wanted = firstSync ? published : addDaysTo(today, -STATS_REFETCH_DAYS);
  const since = [wanted, published, earliest].reduce((a, b) => (a > b ? a : b));
  return { since: since > today ? today : since, until: today };
}

function convert(day: DailyStats, perUsd: number | null): DailyStats {
  return {
    ...day,
    spendUsdCents: accountCentsToUsdCents(day.spendUsdCents, perUsd),
    cpmUsdCents: day.cpmUsdCents === null ? null : accountCentsToUsdCents(day.cpmUsdCents, perUsd),
  };
}

/** Écrit un jour, sans doublon (index unique) : mise à jour d'abord, insertion sinon, nouvel essai si une autre passe a inséré. */
async function writeDay(
  svc: ServiceClient,
  row: Pick<PublishRow, 'id' | 'workspace_id'>,
  day: DailyStats,
  syncedAt: string,
): Promise<void> {
  const values = {
    spend_usd_cents: day.spendUsdCents,
    impressions: day.impressions,
    reach: day.reach,
    clicks: day.clicks,
    results: day.results,
    result_type: day.resultType,
    cpm_usd_cents: day.cpmUsdCents,
    ctr: day.ctr,
    frequency: day.frequency,
    synced_at: syncedAt,
  };
  const update = async (): Promise<number> => {
    const written = await svc
      .from('stats_daily')
      .update(values)
      .eq('workspace_id', row.workspace_id)
      .eq('campaign_id', row.id)
      .is('ad_id', null)
      .eq('date', day.date)
      .select('date');
    if (written.error !== null) throw new AppError('internal_error', { cause: written.error });
    return written.data.length;
  };
  if ((await update()) > 0) return;
  const inserted = await svc.from('stats_daily').insert({
    workspace_id: row.workspace_id,
    campaign_id: row.id,
    ad_id: null,
    date: day.date,
    ...values,
  });
  if (inserted.error === null) return;
  // 23505 : une autre synchronisation (heure pleine + « Actualiser ») vient d'écrire ce jour : on met à jour.
  if (inserted.error.code !== '23505') {
    throw new AppError('internal_error', { cause: inserted.error });
  }
  await update();
}

async function setOutcome(
  ctx: ServiceCtx,
  row: Pick<PublishRow, 'id' | 'workspace_id'>,
  outcome: { error: StatsSyncError | null; synced: boolean },
): Promise<void> {
  const patch = outcome.synced
    ? { stats_synced_at: ctx.now().toISOString(), stats_sync_error: null }
    : { stats_sync_error: outcome.error };
  const written = await ctx.svc
    .from('campaigns')
    .update(patch)
    .eq('workspace_id', row.workspace_id)
    .eq('id', row.id);
  if (written.error !== null) throw new AppError('internal_error', { cause: written.error });
}

function errorKind(error: unknown): StatsSyncError {
  if (metaRateLimitScope(error) !== null) return 'rate_limited';
  if (error instanceof AppError && error.code === 'meta_token_expired') return 'token_expired';
  return 'meta_error';
}

type Outcome = { kind: 'synced'; days: number } | { kind: 'skipped' };

async function syncOne(
  ctx: ServiceCtx,
  deps: SyncDeps,
  candidate: Candidate,
  tokens: Map<string, Promise<PlatformToken>>,
): Promise<Outcome> {
  const row = await loadPublishRow(ctx.svc, candidate.workspace_id, candidate.id);
  const inputs = await loadPublishInputs(ctx.svc, row.workspace_id, row, ctx.now());
  if (inputs.adAccount === null || inputs.connection === null) return { kind: 'skipped' };
  const connection = inputs.connection;
  if (connection.status === 'expired' || connection.status === 'revoked') {
    throw new AppError('meta_token_expired');
  }
  const refs = await loadRefs(ctx.svc, row, inputs.adAccount.metaAdAccountId);
  if (refs === null) return { kind: 'skipped' };

  // Monnaie du compte : jamais supposée. Hors dollar, un taux frais est indispensable.
  const currency = inputs.adAccount.currency;
  if (currency === null) {
    await setOutcome(ctx, row, { error: 'fx_not_available', synced: false });
    return { kind: 'skipped' };
  }
  let perUsd: number | null = null;
  if (currency !== 'USD') {
    perUsd = await freshRate(ctx.svc, currency, ctx.now());
    if (perUsd === null) {
      await setOutcome(ctx, row, { error: 'fx_not_available', synced: false });
      return { kind: 'skipped' };
    }
  }

  let token = tokens.get(connection.id);
  if (token === undefined) {
    token = deps.loadToken(ctx.svc, row.workspace_id, connection);
    tokens.set(connection.id, token);
  }
  const range = rangeFor(row, candidate.stats_synced_at === null, ctx.now());
  const days = await deps.connector.fetchStats(await token, refs, range);
  const syncedAt = ctx.now().toISOString();
  for (const day of days) {
    await writeDay(ctx.svc, row, convert(day, perUsd), syncedAt);
  }
  await setOutcome(ctx, row, { error: null, synced: true });
  return { kind: 'synced', days: days.length };
}

export async function syncCampaignStats(
  ctx: ServiceCtx,
  deps: SyncDeps,
  options: { campaignId?: string; workspaceId?: string; limit?: number } = {},
): Promise<StatsSyncReport> {
  const limit = Math.max(1, Math.min(options.limit ?? STATS_SYNC_BATCH, STATS_SYNC_BATCH));
  let candidates: Candidate[];
  if (options.campaignId !== undefined) {
    // À la demande : une seule campagne, filtrée par espace (jamais une campagne d'un autre espace).
    if (options.workspaceId === undefined) throw new AppError('internal_error');
    const found = await ctx.svc
      .from('campaigns')
      .select(
        'id, workspace_id, status, end_date, stats_synced_at, meta_campaign_id, ad_account_id',
      )
      .eq('workspace_id', options.workspaceId)
      .eq('id', options.campaignId)
      .maybeSingle();
    if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
    candidates =
      found.data !== null && found.data.meta_campaign_id !== null
        ? [{ ...found.data, stats_synced_at: found.data.stats_synced_at ?? null }]
        : [];
  } else {
    candidates = await selectCandidates(ctx, limit);
  }

  const report: StatsSyncReport = {
    scanned: 0,
    synced: 0,
    daysWritten: 0,
    skipped: 0,
    errors: 0,
    rateLimited: false,
  };
  const tokens = new Map<string, Promise<PlatformToken>>();
  const blockedAdAccounts = new Set<string>();

  for (const candidate of candidates) {
    report.scanned += 1;
    if (candidate.ad_account_id !== null && blockedAdAccounts.has(candidate.ad_account_id)) {
      report.skipped += 1;
      continue;
    }
    try {
      const outcome = await syncOne(ctx, deps, candidate, tokens);
      if (outcome.kind === 'synced') {
        report.synced += 1;
        report.daysWritten += outcome.days;
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      const kind = errorKind(error);
      await setOutcome(ctx, candidate, { error: kind, synced: false }).catch((cause: unknown) => {
        logger.error('Raison d’échec non écrite', { campaignId: candidate.id, err: cause });
      });
      if (kind === 'rate_limited') {
        // EC-META-10 : on n'insiste pas, les dernières valeurs restent affichées avec leur heure.
        report.rateLimited = true;
        report.skipped += 1;
        if (metaRateLimitScope(error) === 'app') {
          report.skipped += candidates.length - report.scanned;
          break;
        }
        if (candidate.ad_account_id !== null) blockedAdAccounts.add(candidate.ad_account_id);
        continue;
      }
      report.errors += 1;
      logger.error('Synchronisation des statistiques impossible', {
        campaignId: candidate.id,
        err: error,
      });
    }
  }
  return report;
}
