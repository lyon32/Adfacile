// Tableau de bord `/` et bandeau du haut (APPFLOW §7, PRD §10.1). Lecture seule, tout membre, filtrée par espace.
//  - bandeau : campagnes actives, dépensé ce mois (monnaie locale, dollars dessous) ; les crédits restants arrivent avec S24 ;
//  - graphique des résultats : semaine (7 derniers jours) ou mois (du 1er à aujourd'hui, fuseau de la personne) ;
//  - tableau : chaque campagne avec son résultat, son dépensé et son coût par résultat (TVA retirée : aucun calcul de TVA).
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import { calendarDateIn } from '@pubeka/shared';
import type { MemberCtx } from '../../context';
import type { CampaignStatus } from '../campaign-state';
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
import { toSyncError } from './campaign-stats';
import type { StatsSyncError } from './sync-stats';

export type OverviewRange = 'week' | 'month';
const DAY_MS = 86_400_000;
const MAX_CAMPAIGNS = 100;

export interface OverviewCampaign {
  id: string;
  name: string;
  status: string;
  paused_at: string | null;
  results: number;
  result_kind: ResultKind | null;
  spend: StatsMoney;
  cost_per_result: StatsMoney | null;
  synced_at: string | null;
  sync_error: StatsSyncError | null;
}

export interface OverviewView {
  counts: { active: number; in_review: number; paused: number; stopped: number; other: number };
  month: string;
  spent_month: StatsMoney;
  range: OverviewRange;
  chart: { date: string; results: number; spend_usd_cents: number }[];
  campaigns: OverviewCampaign[];
  fx: StatsFxView;
}

interface CampaignLite {
  id: string;
  name: string;
  status: string;
  destination: string | null;
  paused_at: string | null;
  stats_synced_at: string | null;
  stats_sync_error: string | null;
}

interface WorkspaceStatsRow extends StatsRow {
  campaign_id: string;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Taille d'une page de lecture : au plus le plafond de lignes d'une réponse de la base (PostgREST `max-rows`, 1 000 par défaut). */
const PAGE = 1000;

/**
 * Lignes de statistiques de TOUT l'espace entre deux dates, lues PAR PAGES : une lecture sans pagination serait coupée en silence au
 * plafond de lignes de la base et fausserait le dépensé du mois. Ordre stable (date, campagne) pour que les pages ne se chevauchent pas.
 */
async function readWindowRows(
  ctx: MemberCtx,
  from: string,
  to: string,
): Promise<WorkspaceStatsRow[]> {
  const all: WorkspaceStatsRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const page = unwrap<WorkspaceStatsRow[]>(
      await ctx.db
        .from('stats_daily')
        .select(
          'campaign_id, date, spend_usd_cents, impressions, reach, clicks, results, result_type',
        )
        .eq('workspace_id', ctx.workspace.id)
        .is('ad_id', null)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .order('campaign_id', { ascending: true })
        .range(start, start + PAGE - 1),
    );
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

/** Compte les campagnes par statut AVEC `COUNT` dans la base : exact quel que soit le nombre de campagnes (le tableau n'en montre que 100). */
async function countByStatus(ctx: MemberCtx): Promise<OverviewView['counts']> {
  const count = async (statuses?: readonly CampaignStatus[]): Promise<number> => {
    let query = ctx.db
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspace.id);
    if (statuses !== undefined) query = query.in('status', [...statuses]);
    const result = await query;
    if (result.error !== null) throw new AppError('internal_error', { cause: result.error });
    return result.count ?? 0;
  };
  const [total, active, inReview, paused, stopped] = await Promise.all([
    count(),
    count(['active']),
    count(['in_review', 'publishing']),
    count(['paused']),
    count(['stopped']),
  ]);
  return {
    active,
    in_review: inReview,
    paused,
    stopped,
    other: Math.max(0, total - active - inReview - paused - stopped),
  };
}

export async function getOverview(ctx: MemberCtx, range: OverviewRange): Promise<OverviewView> {
  const today = calendarDateIn(ctx.now(), ctx.user.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const campaigns = unwrap<CampaignLite[]>(
    await ctx.db
      .from('campaigns')
      .select('id, name, status, destination, paused_at, stats_synced_at, stats_sync_error')
      .eq('workspace_id', ctx.workspace.id)
      .order('updated_at', { ascending: false })
      .limit(MAX_CAMPAIGNS),
  );
  const chartFrom = range === 'week' ? addDays(today, -6) : monthStart;
  // On ne lit que la période affichée : le plus ancien du début du mois (dépensé du mois) et du début du graphique.
  const windowStart = chartFrom < monthStart ? chartFrom : monthStart;
  const rows = await readWindowRows(ctx, windowStart, today);
  const { fx } = await loadCostContext(ctx);
  const counts = await countByStatus(ctx);

  // Les totaux du tableau ne portent que sur les campagnes affichées ; le dépensé du mois et le graphique, sur TOUT l'espace.
  const shown = new Set(campaigns.map((c) => c.id));
  const byCampaign = new Map<string, WorkspaceStatsRow[]>();
  for (const row of rows) {
    const list = byCampaign.get(row.campaign_id) ?? [];
    list.push(row);
    byCampaign.set(row.campaign_id, list);
  }

  const spentMonth = rows
    .filter((row) => row.date >= monthStart && row.date <= today)
    .reduce((sum, row) => sum + row.spend_usd_cents, 0);

  const perDay = new Map<string, { results: number; spend: number }>();
  for (let day = chartFrom; day <= today; day = addDays(day, 1))
    perDay.set(day, { results: 0, spend: 0 });
  // Le résultat d'un jour = celui du résultat principal de CHAQUE campagne (on n'additionne pas des types différents).
  for (const list of byCampaign.values()) {
    const main = summarize(list).resultType;
    if (main === null) continue;
    for (const row of list) {
      const slot = perDay.get(row.date);
      if (slot === undefined) continue;
      if (row.result_type === main) slot.results += row.results;
    }
  }
  for (const row of rows) {
    const slot = perDay.get(row.date);
    if (slot !== undefined) slot.spend += row.spend_usd_cents;
  }

  return {
    counts,
    month: today.slice(0, 7),
    spent_month: statsMoney(spentMonth, fx),
    range,
    chart: [...perDay.entries()].map(([date, v]) => ({
      date,
      results: v.results,
      spend_usd_cents: v.spend,
    })),
    campaigns: campaigns.map((campaign) => {
      const totals = summarize(shown.has(campaign.id) ? (byCampaign.get(campaign.id) ?? []) : []);
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        paused_at: campaign.paused_at,
        results: totals.results,
        result_kind: resultKindOf(totals.resultType, campaign.destination),
        spend: statsMoney(totals.spendUsdCents, fx),
        cost_per_result: statsMoneyPerUnit(totals.spendUsdCents, totals.results, fx),
        synced_at: campaign.stats_synced_at,
        sync_error: toSyncError(campaign.stats_sync_error),
      };
    }),
    fx: statsFxView(fx),
  };
}

export function parseOverviewRange(value: string | undefined): OverviewRange {
  if (value === undefined || value === 'week') return 'week';
  if (value === 'month') return 'month';
  throw new AppError('validation_failed', {
    errors: [{ field: 'range', code: 'invalid_value', message: 'week ou month attendu' }],
  });
}
