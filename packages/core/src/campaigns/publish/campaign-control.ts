// Pause, reprise et relance d'une campagne déjà chez Meta (APPFLOW §11, PRD F9, SECURITY_NOTES §2.1 et §2.4).
//
// Règle commune : META EST APPELÉ D'ABORD ; le statut de Pubeka ne change que si Meta a répondu (EC-META-07 : jamais de faux
// succès). Une réponse perdue n'est pas rejouée à l'aveugle : on LIT l'état chez Meta (`getStatus`) puis on décide. Chaque
// changement de statut passe par `nextCampaignStatus` (événements `pause`, `resume`, `recover`).
//
//  - PAUSE : propriétaire ou éditeur, permise même en lecture seule ou suspendue (pour que le client puisse toujours arrêter de
//    dépenser) et même si la Page n'est plus dans la formule (EC-CAMP-09). Déjà en pause : 200 sans appel.
//  - REPRISE : espace modifiable, Page dans la formule.
//  - RELANCE `recover` (campagne ARRÊTÉE, `stopped → active`) : ACTION DU CLIENT, faite après qu'il a réglé sa facture ou rechargé
//    ses fonds chez Meta (décision du 16/10/2026). Aucune détection automatique. Si Meta refuse, son message traduit remonte
//    (`meta.title`, `meta.message`) : jamais un échec muet. Si Meta accepte l'ordre mais que le statut effectif montre encore un
//    défaut de facturation, la relance est refusée (`meta_payment_method_missing`, `reason: billing_still_failing`).
//  - RELANCE `copy` (PRD F9) : un nouveau brouillon copié de la campagne ; il compte comme une nouvelle campagne à sa publication.
//    « Nouveaux visuels » (`similar`, `change`) relève de l'étape Visuel (S23) : refusé clairement tant qu'elle n'existe pas.
import { AppError } from '@pubeka/contracts';
import {
  isAmbiguousMetaFailure,
  toAppError,
  type PlatformConnector,
  type PlatformToken,
} from '@pubeka/platforms';
import { calendarDateIn } from '@pubeka/shared';
import type { MemberCtx } from '../../context';
import { assertRole, assertWritable } from '../../workspaces/guards';
import {
  compact,
  copySchema,
  geoSchema,
  readJson,
  targetingSchema,
  trackingSchema,
} from '../campaign-schemas';
import { nextCampaignStatus } from '../campaign-state';
import {
  CAMPAIGN_COLUMNS,
  getCampaign,
  toCampaignView,
  type CampaignRow,
  type CampaignView,
} from '../campaign-view';
import { loadCostContext } from '../cost-context';
import { addDays, diffDays } from './dates';
import { loadPublishInputs } from './load-inputs';
import { assertPageInPlan } from './page-guard';
import { loadRefs } from './remote-refs';
import { loadPublishRow } from './publish-row';
import type { PublishRow } from './publish-types';
import { applyTransition, recordStatusEvent } from './transitions';
import type { RunPublicationDeps } from './run-publication';

/** Ce que la pause, la reprise, la relance et l'estimation de portée demandent au connecteur : jamais plus. */
export type ControlConnector = Pick<
  PlatformConnector,
  'pause' | 'resume' | 'getStatus' | 'estimateDelivery' | 'searchLocations'
>;

export interface CampaignControlDeps {
  connector: ControlConnector;
  loadToken: RunPublicationDeps['loadToken'];
}

export type RelaunchInput =
  | { mode: 'recover'; version: number }
  | { mode: 'copy'; visual_mode: 'same' | 'similar' | 'change' };

function conflict(reason: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError('conflict', { meta: { reason, ...extra } });
}

function internal(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

interface Remote {
  token: PlatformToken;
  refs: NonNullable<Awaited<ReturnType<typeof loadRefs>>>;
}

/** Jeton déchiffré et identifiants chez Meta : lus ICI, côté serveur, jamais renvoyés ni journalisés. */
async function prepareRemote(
  ctx: MemberCtx,
  row: PublishRow,
  deps: CampaignControlDeps,
): Promise<Remote> {
  const inputs = await loadPublishInputs(ctx.db, ctx.workspace.id, row, ctx.now());
  if (inputs.adAccount === null || inputs.connection === null)
    throw new AppError('meta_not_connected');
  if (inputs.connection.status === 'expired' || inputs.connection.status === 'revoked') {
    throw new AppError('meta_token_expired');
  }
  const refs = await loadRefs(ctx.db, row, inputs.adAccount.metaAdAccountId);
  if (refs === null) throw conflict('not_published_on_meta');
  let token: PlatformToken;
  try {
    token = await deps.loadToken(ctx.svc, ctx.workspace.id, inputs.connection);
  } catch (error) {
    throw error instanceof AppError ? error : internal(error);
  }
  return { token, refs };
}

async function view(ctx: MemberCtx, row: CampaignRow): Promise<CampaignView> {
  return toCampaignView(row, await loadCostContext(ctx));
}

/** Échec d'un changement de statut gardé : quelqu'un a déjà agi. On relit pour répondre juste. */
async function lost(ctx: MemberCtx, campaignId: string, wanted: string): Promise<CampaignView> {
  const latest = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  if (latest.status === wanted) return view(ctx, latest);
  throw conflict('stale_state', { current_version: latest.version, status: latest.status });
}

/**
 * Meta a-t-il bien remis la campagne en route ? Après l'ordre, on lit le statut effectif : s'il montre encore un problème de
 * facturation, on le DIT (jamais un « actif » affiché alors que rien ne diffuse).
 */
async function confirmRunning(deps: CampaignControlDeps, remote: Remote): Promise<AppError | null> {
  const status = await deps.connector.getStatus(remote.token, remote.refs).then(
    (s) => s,
    () => undefined,
  );
  // État illisible juste après un ordre accepté : on garde la réponse de Meta (l'ordre a été accepté).
  if (status === undefined) return null;
  if (status.status === 'active' || status.status === 'in_review') return null;
  const raw = status.rawStatus;
  if (status.status === 'error' && /BILLING|WITH_ISSUES|DISAPPROVED/.test(raw)) {
    return new AppError('meta_payment_method_missing', {
      meta: { reason: 'billing_still_failing', raw_status: raw },
    });
  }
  return new AppError('meta_error', { meta: { reason: 'not_running', raw_status: raw } });
}

/** Ordre d'activation ; une réponse perdue est suivie d'une LECTURE, jamais d'un second ordre. */
async function resumeOnMeta(deps: CampaignControlDeps, remote: Remote): Promise<void> {
  try {
    await deps.connector.resume(remote.token, remote.refs);
  } catch (error) {
    if (!isAmbiguousMetaFailure(error)) throw toAppError(error);
    const status = await deps.connector.getStatus(remote.token, remote.refs).then(
      (s) => s,
      () => undefined,
    );
    if (status?.status !== 'active' && status?.status !== 'in_review') throw toAppError(error);
  }
  const problem = await confirmRunning(deps, remote);
  if (problem !== null) throw problem;
}

// ---- Pause ----------------------------------------------------------------------------------------------------------------

export async function pauseCampaign(
  ctx: MemberCtx,
  campaignId: string,
  deps: CampaignControlDeps,
): Promise<CampaignView> {
  // Volontairement SANS `assertWritable` : la pause reste permise en lecture seule et suspendue (SECURITY_NOTES §2.1).
  assertRole(ctx, ['owner', 'editor']);
  const row = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  if (row.status === 'paused') return view(ctx, row);
  if (!nextCampaignStatus(row.status, 'pause').ok)
    throw conflict('invalid_transition', { status: row.status });

  const remote = await prepareRemote(ctx, row, deps);
  try {
    await deps.connector.pause(remote.token, remote.refs);
  } catch (error) {
    // Meta n'a pas répondu : la campagne n'est PAS affichée en pause (EC-META-07). Mettre en pause est idempotent chez Meta.
    throw toAppError(error);
  }
  const paused = await applyTransition(ctx.svc, row, 'pause', {
    paused_at: ctx.now().toISOString(),
  });
  if (paused === null) return lost(ctx, campaignId, 'paused');
  await recordStatusEvent(ctx.svc, paused, 'paused', 'user');
  return view(ctx, paused);
}

// ---- Reprise --------------------------------------------------------------------------------------------------------------

export async function resumeCampaign(
  ctx: MemberCtx,
  campaignId: string,
  deps: CampaignControlDeps,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const row = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  if (row.status === 'active') return view(ctx, row);
  if (!nextCampaignStatus(row.status, 'resume').ok)
    throw conflict('invalid_transition', { status: row.status });

  const inputs = await loadPublishInputs(ctx.db, ctx.workspace.id, row, ctx.now());
  await assertPageInPlan({ svc: ctx.svc, workspaceId: ctx.workspace.id }, inputs.page, row.page_id);
  const remote = await prepareRemote(ctx, row, deps);
  await resumeOnMeta(deps, remote);
  const resumed = await applyTransition(ctx.svc, row, 'resume', { paused_at: null });
  if (resumed === null) return lost(ctx, campaignId, 'active');
  await recordStatusEvent(ctx.svc, resumed, 'active', 'user');
  return view(ctx, resumed);
}

// ---- Relance --------------------------------------------------------------------------------------------------------------

async function recover(
  ctx: MemberCtx,
  campaignId: string,
  version: number,
  deps: CampaignControlDeps,
): Promise<CampaignView> {
  const row = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  if (row.version !== version) throw conflict('stale_version', { current_version: row.version });
  if (!nextCampaignStatus(row.status, 'recover').ok)
    throw conflict('invalid_transition', { status: row.status });

  const inputs = await loadPublishInputs(ctx.db, ctx.workspace.id, row, ctx.now());
  await assertPageInPlan({ svc: ctx.svc, workspaceId: ctx.workspace.id }, inputs.page, row.page_id);
  const remote = await prepareRemote(ctx, row, deps);
  // Si Meta refuse, son message traduit remonte tel quel (meta.title, meta.message) : la campagne reste arrêtée.
  await resumeOnMeta(deps, remote);
  const recovered = await applyTransition(
    ctx.svc,
    row,
    'recover',
    { paused_at: null },
    { version },
  );
  if (recovered === null) return lost(ctx, campaignId, 'active');
  await recordStatusEvent(ctx.svc, recovered, 'active', 'user', { event: 'recover' });
  return view(ctx, recovered);
}

const COPY_SUFFIX = { fr: ' (copie)', en: ' (copy)' } as const;
const MAX_NAME = 200;

async function copyCampaign(
  ctx: MemberCtx,
  campaignId: string,
  visualMode: 'same' | 'similar' | 'change',
): Promise<CampaignView> {
  if (visualMode !== 'same') {
    throw new AppError('validation_failed', {
      errors: [
        {
          field: 'visual_mode',
          code: 'unsupported',
          message:
            'De nouveaux visuels arrivent avec l’étape Visuel : pour l’instant, la relance garde le même visuel.',
        },
      ],
    });
  }
  const row = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  if (row.status === 'draft') throw conflict('invalid_transition', { status: row.status });

  const suffix = COPY_SUFFIX[ctx.user.locale];
  const name = `${row.name.slice(0, MAX_NAME - suffix.length)}${suffix}`;
  // Mêmes durées, recalées à partir d'aujourd'hui dans le fuseau de l'utilisateur ; des dates absentes restent absentes.
  const today = calendarDateIn(ctx.now(), ctx.user.timezone);
  const hasDates = row.start_date !== null && row.end_date !== null;
  const account = await ctx.db
    .from('ad_accounts')
    .select('id')
    .eq('workspace_id', ctx.workspace.id)
    .eq('is_active', true)
    .maybeSingle();
  if (account.error !== null) throw internal(account.error);

  const inserted = await ctx.svc
    .from('campaigns')
    .insert({
      workspace_id: ctx.workspace.id,
      page_id: row.page_id,
      ad_account_id: account.data?.id ?? row.ad_account_id,
      analysis_id: row.analysis_id,
      created_by: ctx.user.id,
      platform: row.platform,
      name,
      objective: row.objective,
      destination: row.destination,
      optimization_goal: row.optimization_goal,
      geo: compact(readJson(geoSchema, row.geo, {})),
      targeting: compact(readJson(targetingSchema, row.targeting, {})),
      daily_budget_usd_cents: row.daily_budget_usd_cents,
      copy: compact(readJson(copySchema, row.copy, {})),
      tracking: readJson(trackingSchema, row.tracking, null),
      ab_test: row.ab_test,
      visual_brief: row.visual_brief,
      chosen_proposal_version: row.chosen_proposal_version,
      start_date: hasDates ? today : null,
      end_date: hasDates
        ? addDays(today, diffDays(row.end_date ?? today, row.start_date ?? today))
        : null,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (inserted.error !== null) throw internal(inserted.error);
  return getCampaign(ctx, inserted.data.id);
}

export async function relaunchCampaign(
  ctx: MemberCtx,
  campaignId: string,
  input: RelaunchInput,
  deps: CampaignControlDeps,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  return input.mode === 'recover'
    ? recover(ctx, campaignId, input.version, deps)
    : copyCampaign(ctx, campaignId, input.visual_mode);
}
