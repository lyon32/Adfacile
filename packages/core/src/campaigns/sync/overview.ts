// Tableau de bord `/` et bandeau du haut (APPFLOW §7, PRD §10.1). Lecture seule, tout membre, filtrée par espace.
//  - bandeau : campagnes actives, dépensé ce mois (monnaie locale, dollars dessous) ; les crédits restants arrivent avec S24 ;
//  - graphique des résultats : semaine (7 derniers jours) ou mois (du 1er à aujourd'hui, fuseau de la personne) ;
//  - tableau : chaque campagne avec son résultat, son dépensé et son coût par résultat (TVA retirée : aucun calcul de TVA).
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import { calendarDateIn } from '@pubeka/shared';
import type { MemberCtx } from '../../context';
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
  const ids = campaigns.map((c) => c.id);
  const rows: WorkspaceStatsRow[] =
    ids.length === 0
      ? []
      : unwrap<WorkspaceStatsRow[]>(
          await ctx.db
            .from('stats_daily')
            .select(
              'campaign_id, date, spend_usd_cents, impressions, reach, clicks, results, result_type',
            )
            .eq('workspace_id', ctx.workspace.id)
            .in('campaign_id', ids)
            .is('ad_id', null)
            .limit(20_000),
        );
  const { fx } = await loadCostContext(ctx);

  const byCampaign = new Map<string, WorkspaceStatsRow[]>();
  for (const row of rows) {
    const list = byCampaign.get(row.campaign_id) ?? [];
    list.push(row);
    byCampaign.set(row.campaign_id, list);
  }

  const counts = { active: 0, in_review: 0, paused: 0, stopped: 0, other: 0 };
  for (const campaign of campaigns) {
    if (campaign.status === 'active') counts.active += 1;
    else if (campaign.status === 'in_review' || campaign.status === 'publishing')
      counts.in_review += 1;
    else if (campaign.status === 'paused') counts.paused += 1;
    else if (campaign.status === 'stopped') counts.stopped += 1;
    else counts.other += 1;
  }

  const spentMonth = rows
    .filter((row) => row.date >= monthStart && row.date <= today)
    .reduce((sum, row) => sum + row.spend_usd_cents, 0);

  const chartFrom = range === 'week' ? addDays(today, -6) : monthStart;
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
      const totals = summarize(byCampaign.get(campaign.id) ?? []);
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
