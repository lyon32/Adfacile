// Estimation de portée (PRD F6, APPFLOW §8.3/§8.5), décision du 16/10/2026 : elle vient de META (estimation de diffusion,
// `delivery_estimate`), jamais d'un calcul de Pubeka. Si Meta ne répond pas ou ne donne rien d'exploitable, l'écran n'affiche
// AUCUNE estimation : `status: "unavailable"` et `audience: null`, avec la raison. Lecture seule : rien n'est créé, aucun quota.
//
// Ce que Meta estime : le nombre de personnes actives le mois dernier sur les plateformes choisies qui correspondent au ciblage
// (bornes basse et haute). Ce n'est pas un nombre de personnes qui verront la pub avec CE budget : l'écran le dit.
import { AppError } from '@pubeka/contracts';
import { toAppError, type PlatformConnector } from '@pubeka/platforms';
import type { MemberCtx } from '../../context';
import {
  copySchema,
  geoSchema,
  readJson,
  targetingSchema,
  trackingSchema,
} from '../campaign-schemas';
import { buildPublishSpec } from './build-spec';
import { loadPublishInputs } from './load-inputs';
import { resolveLocations } from './locations';
import { loadPublishRow } from './publish-row';
import type { RunPublicationDeps } from './run-publication';

export type ReachEstimateReason =
  'not_connected' | 'token_expired' | 'incomplete_campaign' | 'meta_unavailable' | 'not_ready';

export interface ReachEstimateView {
  status: 'ok' | 'unavailable';
  reason: ReachEstimateReason | null;
  audience: { lower: number; upper: number } | null;
  source: 'meta_delivery_estimate';
  fetched_at: string;
}

export interface ReachEstimateDeps {
  connector: Pick<PlatformConnector, 'estimateDelivery' | 'searchLocations'>;
  loadToken: RunPublicationDeps['loadToken'];
}

export async function getReachEstimate(
  ctx: MemberCtx,
  campaignId: string,
  deps: ReachEstimateDeps,
): Promise<ReachEstimateView> {
  const row = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  const fetchedAt = ctx.now().toISOString();
  const unavailable = (reason: ReachEstimateReason): ReachEstimateView => ({
    status: 'unavailable',
    reason,
    audience: null,
    source: 'meta_delivery_estimate',
    fetched_at: fetchedAt,
  });

  const inputs = await loadPublishInputs(ctx.db, ctx.workspace.id, row, ctx.now());
  if (inputs.adAccount === null || inputs.connection === null || inputs.page === null) {
    return unavailable('not_connected');
  }
  if (inputs.connection.status === 'expired' || inputs.connection.status === 'revoked') {
    return unavailable('token_expired');
  }
  const geo = readJson(geoSchema, row.geo, {});
  if (
    row.objective === null ||
    row.destination === null ||
    row.daily_budget_usd_cents === null ||
    row.start_date === null ||
    row.end_date === null ||
    ((geo.countries ?? []).length === 0 && (geo.cities ?? []).length === 0)
  ) {
    return unavailable('incomplete_campaign');
  }

  try {
    const token = await deps.loadToken(ctx.svc, ctx.workspace.id, inputs.connection);
    const owner = await ctx.svc
      .from('workspaces')
      .select('owner_id')
      .eq('id', ctx.workspace.id)
      .maybeSingle();
    const profile =
      owner.data === null || owner.error !== null
        ? null
        : await ctx.svc
            .from('profiles')
            .select('country_code')
            .eq('id', owner.data.owner_id)
            .maybeSingle();
    const locations = await resolveLocations(
      deps.connector,
      token,
      geo,
      profile?.data?.country_code ?? null,
    );
    const spec = buildPublishSpec({
      campaign: {
        name: row.name,
        objective: row.objective,
        destination: row.destination,
        optimization_goal: row.optimization_goal,
        geo,
        targeting: readJson(targetingSchema, row.targeting, {}),
        daily_budget_usd_cents: row.daily_budget_usd_cents,
        start_date: row.start_date,
        end_date: row.end_date,
        copy: readJson(copySchema, row.copy, {}),
        tracking: readJson(trackingSchema, row.tracking, null),
      },
      ref: 'estimate',
      page: inputs.page,
      adAccount: inputs.adAccount,
      // La monnaie n'intervient pas dans l'estimation d'audience.
      account: { code: 'USD' },
      website: inputs.business.website,
      mediaUrl: null,
      locations,
    });
    const estimate = await deps.connector.estimateDelivery(token, spec);
    if (estimate === null) return unavailable('not_ready');
    return {
      status: 'ok',
      reason: null,
      audience: { lower: estimate.lowerBound, upper: estimate.upperBound },
      source: 'meta_delivery_estimate',
      fetched_at: fetchedAt,
    };
  } catch (error) {
    const app = error instanceof AppError ? error : toAppError(error);
    if (app.code === 'meta_token_expired') return unavailable('token_expired');
    if (app.code === 'validation_failed') return unavailable('incomplete_campaign');
    return unavailable('meta_unavailable');
  }
}
