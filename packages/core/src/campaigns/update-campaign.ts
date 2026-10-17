// PATCH /workspaces/{ws}/campaigns/{id} : modification d'un brouillon avec verrou optimiste (EC-TEAM-08).
//
// Concurrence : la version lue par le client DOIT être renvoyée. La mise à jour est UNE seule instruction
// `update … where version = <lue>` : si deux personnes écrivent en même temps, la base n'en laisse passer qu'une
// (la seconde ne trouve plus la version et ne modifie rien) → 409 `conflict` avec `meta.current_version`.
// Le contrôle fait avant l'écriture ne sert qu'à donner une réponse plus nette ; il n'est pas la garantie.
//
// Fusion : `copy` et `targeting` sont fusionnés champ par champ (modifier un titre ne touche pas au reste), `geo`
// et `interests` sont remplacés en entier. Les montants, la TVA et le taux de change sont recalculés ICI : jamais
// repris du navigateur (SECURITY_NOTES §3.2, API_SPEC §1 « prix »).
import { AppError } from '@pubeka/contracts';
import type { TablesUpdate } from '@pubeka/db';
import { calendarDateIn } from '@pubeka/shared';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import {
  compact,
  copySchema,
  geoSchema,
  readJson,
  targetingSchema,
  type AdCopy,
  type Geo,
  type Targeting,
  type Tracking,
} from './campaign-schemas';
import { checkCampaignFields } from './campaign-fields';
import {
  CAMPAIGN_COLUMNS,
  loadCampaignRow,
  toCampaignView,
  type CampaignRow,
  type CampaignView,
} from './campaign-view';
import { loadCostContext } from './cost-context';

export interface CampaignPatch {
  name?: string | undefined;
  objective?: string | undefined;
  destination?: string | undefined;
  geo?: Geo | undefined;
  targeting?: Targeting | undefined;
  daily_budget_usd_cents?: number | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  copy?: AdCopy | undefined;
  tracking?: Tracking | undefined;
  ab_test?: boolean | undefined;
  version: number;
}

function conflict(current: number, reason: string): AppError {
  return new AppError('conflict', { meta: { current_version: current, reason } });
}

async function assertPixelBelongs(
  ctx: MemberCtx,
  row: CampaignRow,
  pixelId: string,
): Promise<void> {
  const pixels =
    row.page_id === null
      ? []
      : ((
          await ctx.db
            .from('pages')
            .select('pixel_ids')
            .eq('workspace_id', ctx.workspace.id)
            .eq('id', row.page_id)
            .maybeSingle()
        ).data?.pixel_ids ?? []);
  if (!pixels.includes(pixelId)) {
    throw new AppError('validation_failed', {
      errors: [
        {
          field: 'tracking.pixel_id',
          code: 'invalid_value',
          message: 'Ce pixel n’appartient pas à la Page de la campagne.',
        },
      ],
    });
  }
}

export async function updateCampaign(
  ctx: MemberCtx,
  campaignId: string,
  patch: CampaignPatch,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const row = await loadCampaignRow(ctx, campaignId);

  // S15 ne modifie que les brouillons ; une campagne publiée est renvoyée à Meta par S16.
  if (row.status !== 'draft' || !row.editable) {
    throw conflict(row.version, 'campaign_not_editable');
  }
  if (patch.version !== row.version) throw conflict(row.version, 'stale_version');

  const changed = new Set<string>(
    Object.keys(patch).filter(
      (key) => key !== 'version' && patch[key as keyof CampaignPatch] !== undefined,
    ),
  );
  if (changed.size === 0) {
    throw new AppError('validation_failed', {
      errors: [{ field: 'body', code: 'required', message: 'Aucun champ à modifier.' }],
    });
  }

  const currentCopy = readJson(copySchema, row.copy, {});
  const currentTargeting = readJson(targetingSchema, row.targeting, {});
  const mergedCopy: AdCopy = { ...currentCopy, ...patch.copy };
  const mergedTargeting: Targeting = { ...currentTargeting, ...patch.targeting };
  const mergedGeo: Geo = patch.geo ?? readJson(geoSchema, row.geo, {});
  const budget = patch.daily_budget_usd_cents ?? row.daily_budget_usd_cents;
  const startDate = patch.start_date ?? row.start_date;
  const endDate = patch.end_date ?? row.end_date;
  const objective = patch.objective ?? row.objective;
  const destination = patch.destination ?? row.destination;

  checkCampaignFields(
    {
      objective,
      destination,
      dailyBudgetUsdCents: budget,
      startDate,
      endDate,
      copy: mergedCopy,
      targeting: mergedTargeting,
      geo: mergedGeo,
    },
    changed,
    calendarDateIn(ctx.now(), ctx.user.timezone),
  );
  if (patch.tracking !== undefined && patch.tracking !== null) {
    await assertPixelBelongs(ctx, row, patch.tracking.pixel_id);
  }

  // Instantané du change à l'écriture (S16 compare avec les taux du jour : EC-CAMP-05).
  const costContext = await loadCostContext(ctx);
  const values: TablesUpdate<'campaigns'> = {
    fx_rate_xaf: costContext.fx?.rate ?? null,
  };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.objective !== undefined) values.objective = patch.objective;
  if (patch.destination !== undefined) values.destination = patch.destination;
  if (patch.geo !== undefined) values.geo = compact(mergedGeo);
  if (patch.targeting !== undefined) values.targeting = compact(mergedTargeting);
  if (patch.daily_budget_usd_cents !== undefined) values.daily_budget_usd_cents = budget;
  if (patch.start_date !== undefined) values.start_date = startDate;
  if (patch.end_date !== undefined) values.end_date = endDate;
  if (patch.copy !== undefined) values.copy = compact(mergedCopy);
  if (patch.tracking !== undefined) values.tracking = patch.tracking;
  if (patch.ab_test !== undefined) values.ab_test = patch.ab_test;

  // L'instruction unique qui fait foi : la condition `version = lue` est évaluée par la base au moment de l'écriture.
  const written = await ctx.svc
    .from('campaigns')
    .update(values)
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', campaignId)
    .eq('version', patch.version)
    .eq('status', 'draft')
    .eq('editable', true)
    .select(CAMPAIGN_COLUMNS);
  if (written.error !== null) {
    // Une contrainte de la base (budget, dates…) que la validation aurait laissée passer : jamais un 500 muet.
    if (written.error.code === '23514') {
      throw new AppError('validation_failed', {
        errors: [
          { field: 'body', code: 'invalid_value', message: 'Valeurs refusées par la base.' },
        ],
        cause: written.error,
      });
    }
    throw new AppError('internal_error', { cause: written.error });
  }
  const updated = written.data[0] as CampaignRow | undefined;
  if (updated === undefined) {
    // Quelqu'un a écrit entre notre lecture et notre écriture : on relit pour dire laquelle des deux situations.
    const latest = await loadCampaignRow(ctx, campaignId);
    throw conflict(
      latest.version,
      latest.status !== 'draft' || !latest.editable ? 'campaign_not_editable' : 'stale_version',
    );
  }
  return toCampaignView(updated, costContext);
}
