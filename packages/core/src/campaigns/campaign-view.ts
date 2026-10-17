// Lecture d'une campagne et forme de la réponse `Campaign` (openapi.yaml). Toutes les lectures sont filtrées par
// `workspace_id` (SECURITY_NOTES §2) ; une campagne d'un autre espace est introuvable (404, jamais 403).
import { AppError, type components } from '@pubeka/contracts';
import type { MemberCtx } from '../context';
import {
  compact,
  copySchema,
  geoSchema,
  readJson,
  targetingSchema,
  trackingSchema,
} from './campaign-schemas';
import { campaignCost } from './cost';
import { loadCostContext, type CostContext } from './cost-context';

export type CampaignView = components['schemas']['Campaign'];

export const CAMPAIGN_COLUMNS =
  'id, workspace_id, page_id, ad_account_id, analysis_id, name, platform, objective, destination, optimization_goal, geo, targeting, daily_budget_usd_cents, vat_rate, fx_rate_xaf, start_date, end_date, copy, tracking, visual_brief, ab_test, status, published_at, editable, chosen_proposal_version, version';

export interface CampaignRow {
  id: string;
  workspace_id: string;
  page_id: string | null;
  ad_account_id: string | null;
  analysis_id: string | null;
  name: string;
  platform: 'meta' | 'google' | 'tiktok';
  objective: string | null;
  destination: string | null;
  optimization_goal: string | null;
  geo: unknown;
  targeting: unknown;
  daily_budget_usd_cents: number | null;
  fx_rate_xaf: number | null;
  start_date: string | null;
  end_date: string | null;
  copy: unknown;
  tracking: unknown;
  visual_brief: string | null;
  ab_test: boolean;
  status: string;
  published_at: string | null;
  editable: boolean;
  chosen_proposal_version: number | null;
  version: number;
}

type Objective = NonNullable<CampaignView['objective']>;
type Destination = NonNullable<CampaignView['destination']>;
type Goal = NonNullable<CampaignView['optimization_goal']>;

const OBJECTIVES: readonly Objective[] = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
  'OUTCOME_SALES',
];
const DESTINATIONS: readonly Destination[] = [
  'WHATSAPP',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
  'WEBSITE',
  'APP',
  'ON_POST',
  'NONE',
];
const GOALS: readonly Goal[] = [
  'CONVERSATIONS',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'POST_ENGAGEMENT',
  'REACH',
  'OFFSITE_CONVERSIONS',
];
const STATUSES: readonly CampaignView['status'][] = [
  'draft',
  'publishing',
  'in_review',
  'active',
  'paused',
  'rejected',
  'ended',
  'stopped',
  'error',
];

function pick<T extends string>(list: readonly T[], value: string | null): T | null {
  return list.find((item) => item === value) ?? null;
}

export async function loadCampaignRow(ctx: MemberCtx, campaignId: string): Promise<CampaignRow> {
  const found = await ctx.db
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', campaignId)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  if (found.data === null) throw new AppError('not_found');
  return found.data;
}

export function toCampaignView(row: CampaignRow, costContext: CostContext): CampaignView {
  const status = pick(STATUSES, row.status);
  if (status === null) throw new AppError('internal_error', { meta: { reason: 'status' } });
  const cost = campaignCost({
    dailyBudgetUsdCents: row.daily_budget_usd_cents,
    startDate: row.start_date,
    endDate: row.end_date,
    fx: costContext.fx,
  });
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    page_id: row.page_id,
    analysis_id: row.analysis_id,
    status,
    objective: pick(OBJECTIVES, row.objective),
    destination: pick(DESTINATIONS, row.destination),
    optimization_goal: pick(GOALS, row.optimization_goal),
    geo: compact(readJson(geoSchema, row.geo, {})),
    targeting: compact(readJson(targetingSchema, row.targeting, {})),
    daily_budget_usd_cents: row.daily_budget_usd_cents,
    cost,
    start_date: row.start_date,
    end_date: row.end_date,
    copy: compact(readJson(copySchema, row.copy, {})),
    tracking: readJson(trackingSchema, row.tracking, null),
    visual_brief: row.visual_brief,
    ab_test: row.ab_test,
    editable: row.editable && row.status === 'draft',
    chosen_proposal_version: row.chosen_proposal_version,
    published_at: row.published_at,
    version: row.version,
  };
}

export async function getCampaign(ctx: MemberCtx, campaignId: string): Promise<CampaignView> {
  const row = await loadCampaignRow(ctx, campaignId);
  return toCampaignView(row, await loadCostContext(ctx));
}
