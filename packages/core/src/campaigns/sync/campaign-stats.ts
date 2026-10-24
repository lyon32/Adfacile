// Statistiques d'une campagne pour l'écran « Résultats » (APPFLOW §11.3, PRD §10.2, F7). Lecture seule, tout membre.
// Lues dans NOTRE base (copiées toutes les heures), jamais chez Meta à la volée. Toute lecture est filtrée par `workspace_id`.
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { MemberCtx } from '../../context';
import { loadCampaignRow } from '../campaign-view';
import { loadCostContext } from '../cost-context';
import { resultKindOf, type ResultKind } from './result-kind';
import {
  statsFxView,
  statsMoney,
  statsMoneyPerUnit,
  type StatsFxView,
  type StatsMoney,
} from './stats-money';
import { summarize, type StatsRow } from './stats-math';
import type { StatsSyncError } from './sync-stats';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CampaignStatsView {
  range: { from: string; to: string };
  summary: {
    spend: StatsMoney;
    results: number;
    result_kind: ResultKind | null;
    cost_per_result: StatsMoney | null;
    /** Somme des portées quotidiennes (une personne vue deux jours compte deux fois). */
    reach: number;
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpm: StatsMoney | null;
    frequency: number | null;
  };
  daily: {
    date: string;
    spend: StatsMoney;
    results: number;
    impressions: number;
    reach: number;
    clicks: number;
  }[];
  fx: StatsFxView;
  /** Heure de la dernière copie réussie ; `null` : jamais synchronisée. */
  synced_at: string | null;
  /** Pourquoi la dernière tentative a échoué (les valeurs affichées sont alors celles de `synced_at`). */
  sync_error: StatsSyncError | null;
}

export interface StatsRangeInput {
  from?: string | undefined;
  to?: string | undefined;
}

function validDate(value: string, field: string): void {
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new AppError('validation_failed', {
      errors: [{ field, code: 'invalid_format', message: 'Date AAAA-MM-JJ attendue' }],
    });
  }
}

export function resolveRange(input: StatsRangeInput, now: Date): { from: string; to: string } {
  const today = now.toISOString().slice(0, 10);
  const to = input.to ?? today;
  validDate(to, 'to');
  const from =
    input.from ??
    new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_WINDOW_DAYS - 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
  validDate(from, 'from');
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (span < 0 || span >= MAX_WINDOW_DAYS) {
    throw new AppError('validation_failed', {
      errors: [
        {
          field: 'from',
          code: 'out_of_range',
          message: 'Période de 366 jours au plus, début avant la fin',
        },
      ],
    });
  }
  return { from, to };
}

const STATS_COLUMNS =
  'date, spend_usd_cents, impressions, reach, clicks, results, result_type' as const;

const SYNC_ERRORS: readonly StatsSyncError[] = [
  'rate_limited',
  'fx_not_available',
  'meta_error',
  'token_expired',
];

export function toSyncError(value: string | null): StatsSyncError | null {
  return SYNC_ERRORS.find((e) => e === value) ?? null;
}

export async function getCampaignStats(
  ctx: MemberCtx,
  campaignId: string,
  input: StatsRangeInput = {},
): Promise<CampaignStatsView> {
  const campaign = await loadCampaignRow(ctx, campaignId);
  const range = resolveRange(input, ctx.now());
  const rows = unwrap<StatsRow[]>(
    await ctx.db
      .from('stats_daily')
      .select(STATS_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('campaign_id', campaignId)
      .is('ad_id', null)
      .gte('date', range.from)
      .lte('date', range.to)
      .order('date', { ascending: true }),
  );
  const sync = await ctx.db
    .from('campaigns')
    .select('stats_synced_at, stats_sync_error')
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', campaignId)
    .maybeSingle();
  if (sync.error !== null) throw new AppError('internal_error', { cause: sync.error });

  const { fx } = await loadCostContext(ctx);
  const totals = summarize(rows);
  return {
    range,
    summary: {
      spend: statsMoney(totals.spendUsdCents, fx),
      results: totals.results,
      result_kind: resultKindOf(totals.resultType, campaign.destination),
      cost_per_result: statsMoneyPerUnit(totals.spendUsdCents, totals.results, fx),
      reach: totals.reach,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.ctr,
      cpm: totals.cpmUsdCents === null ? null : statsMoney(totals.cpmUsdCents, fx),
      frequency: totals.frequency,
    },
    daily: rows.map((row) => ({
      date: row.date,
      spend: statsMoney(row.spend_usd_cents, fx),
      results: row.results,
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
    })),
    fx: statsFxView(fx),
    synced_at: sync.data?.stats_synced_at ?? null,
    sync_error: toSyncError(sync.data?.stats_sync_error ?? null),
  };
}
