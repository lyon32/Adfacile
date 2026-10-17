// Propositions du Stratège : générer (une à la fois), lister, retenir (LLD §6.8, APPFLOW §8.3).
//
// DÉPENSE (un appel IA) : une `Idempotency-Key` désigne UNE génération par campagne. La ligne `campaign_proposals` est
// RÉSERVÉE (statut `generating`, clé unique) AVANT l'appel au modèle ; un double clic ou un renvoi réseau avec la même clé
// retrouve cette ligne au lieu de relancer un appel :
//   - prête → rejouée telle quelle, aucun appel ;
//   - en cours → 409 `conflict` (réessaie dans quelques secondes) ;
//   - échouée → la MÊME erreur : un appel au résultat incertain n'est jamais relancé automatiquement (EC-META-05) ;
//     l'utilisateur recommence avec une nouvelle clé (nouvelle intention).
// La sortie du modèle n'est enregistrée qu'après validation complète (schéma, R3, ton, limites). Ce qui s'affiche pendant
// l'écriture (flux, PR suivante) n'est qu'un aperçu non contractuel.
import {
  AgentRunError,
  strategeAgent,
  strategeInputSchema,
  strategeStoredSchema,
  createFieldStream,
  prepareStrategeMessage,
  previewAllowed,
  runAgent,
  strategeCopyContext,
  type FieldEvent,
  type StrategeOutput,
} from '@pubeka/agents';
import { AppError, isErrorCode, type components, type ErrorCode } from '@pubeka/contracts';
import type { Json, TablesUpdate } from '@pubeka/db';
import { calendarDateIn, createLogger } from '@pubeka/shared';
import { journalAgentRun } from '../agent-journal';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import { checkCampaignFields } from './campaign-fields';
import { compact, readJson, targetingSchema } from './campaign-schemas';
import {
  CAMPAIGN_COLUMNS,
  loadCampaignRow,
  toCampaignView,
  type CampaignRow,
  type CampaignView,
} from './campaign-view';
import { campaignCost } from './cost';
import { loadCostContext } from './cost-context';
import type { ProposalDeps } from './proposal-deps';

export type ProposalView = components['schemas']['Proposal'];

const DEFAULT_STALE_MS = 120_000;
/** Code d'une ligne marquée perdue par un renvoi : son résultat tardif, s'il arrive, est quand même enregistré. */
const EXPIRED = 'generation_expired';
const logger = createLogger({ base: { module: 'proposals' } });
const MAX_PREVIOUS = 5;
const MAX_VERSION_ATTEMPTS = 4;
/** Signalements réservés à l'administration : jamais montrés à l'écran (APPFLOW §8.1 pour l'injection). */
const INTERNAL_FLAGS = new Set(['PROMPT_INJECTION_SUSPECTED']);

interface ProposalRow {
  id: string;
  version: number;
  status: string;
  proposal: unknown;
  chosen: boolean;
  error_code: string | null;
  idempotency_key: string | null;
  created_at: string;
}
const PROPOSAL_COLUMNS =
  'id, version, status, proposal, chosen, error_code, idempotency_key, created_at';

export interface GenerateOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
}

function db(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

function conflict(reason: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError('conflict', { meta: { reason, ...extra } });
}

function errorFromCode(code: string | null): AppError {
  if (code === null || !isErrorCode(code)) return new AppError('provider_unavailable');
  return new AppError(code);
}

export function toProposalView(
  row: ProposalRow,
  stored: StrategeOutput,
  chosenVersion: number | null,
  cost: components['schemas']['CampaignCost'],
): ProposalView {
  return {
    version: row.version,
    status: 'ready',
    chosen: chosenVersion === row.version,
    proposal: compact({ ...stored, flags: stored.flags.filter((f) => !INTERNAL_FLAGS.has(f)) }),
    cost,
    created_at: new Date(row.created_at).toISOString(),
  };
}

async function viewOf(
  ctx: MemberCtx,
  campaign: CampaignRow,
  row: ProposalRow,
): Promise<ProposalView> {
  const parsed = strategeStoredSchema.safeParse(row.proposal);
  if (!parsed.success)
    throw new AppError('internal_error', { meta: { reason: 'stored_proposal' } });
  const costContext = await loadCostContext(ctx);
  const cost = campaignCost({
    dailyBudgetUsdCents: parsed.data.budget.daily_usd_cents,
    startDate: parsed.data.schedule.start_date,
    endDate: parsed.data.schedule.end_date,
    fx: costContext.fx,
  });
  return toProposalView(row, parsed.data, campaign.chosen_proposal_version, cost);
}

// ---- Lecture ---------------------------------------------------------------------------------------------------------

export async function listProposals(ctx: MemberCtx, campaignId: string): Promise<ProposalView[]> {
  const campaign = await loadCampaignRow(ctx, campaignId);
  const rows = await ctx.db
    .from('campaign_proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('workspace_id', ctx.workspace.id)
    .eq('campaign_id', campaignId)
    .eq('status', 'ready')
    .order('version', { ascending: true });
  if (rows.error !== null) throw db(rows.error);
  const views: ProposalView[] = [];
  for (const row of rows.data) views.push(await viewOf(ctx, campaign, row));
  return views;
}

// ---- Génération ------------------------------------------------------------------------------------------------------

interface Material {
  input: unknown;
  summary: NonNullable<Json>;
}

/** Rassemble ce que le Stratège reçoit : fiche, réponses, état du compte, propositions précédentes. */
async function gatherInput(ctx: MemberCtx, campaign: CampaignRow): Promise<Material> {
  const workspaceId = ctx.workspace.id;
  if (campaign.analysis_id === null) throw conflict('analysis_missing');

  const analysis = await ctx.db
    .from('analyses')
    .select('business_profile_id, user_intent')
    .eq('workspace_id', workspaceId)
    .eq('id', campaign.analysis_id)
    .maybeSingle();
  if (analysis.error !== null) throw db(analysis.error);
  const profileId = analysis.data?.business_profile_id ?? null;
  if (profileId === null) throw conflict('analysis_missing');

  const profile = await ctx.db
    .from('business_profiles')
    .select('profile, questions, answers')
    .eq('workspace_id', workspaceId)
    .eq('id', profileId)
    .maybeSingle();
  if (profile.error !== null) throw db(profile.error);
  if (profile.data === null) throw conflict('analysis_missing');

  const page =
    campaign.page_id === null
      ? null
      : (
          await ctx.db
            .from('pages')
            .select('ad_language, ad_address, whatsapp_linked, instagram_account_id, pixel_ids')
            .eq('workspace_id', workspaceId)
            .eq('id', campaign.page_id)
            .maybeSingle()
        ).data;

  const kit =
    campaign.page_id === null
      ? null
      : (
          await ctx.db
            .from('brand_kits')
            .select('phone, whatsapp, tagline')
            .eq('workspace_id', workspaceId)
            .eq('page_id', campaign.page_id)
            .maybeSingle()
        ).data;

  const previous = await ctx.db
    .from('campaign_proposals')
    .select('proposal')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaign.id)
    .eq('status', 'ready')
    .order('version', { ascending: false })
    .limit(MAX_PREVIOUS);
  if (previous.error !== null) throw db(previous.error);

  const questions = Array.isArray(profile.data.questions)
    ? (profile.data.questions as unknown[])
    : [];
  const answers = Array.isArray(profile.data.answers) ? (profile.data.answers as unknown[]) : [];
  const questionText = new Map<string, string>();
  for (const q of questions) {
    if (typeof q === 'object' && q !== null) {
      const rec = q as Record<string, unknown>;
      if (typeof rec.id === 'string' && typeof rec.text === 'string')
        questionText.set(rec.id, rec.text);
    }
  }
  const asked: { question: string; answer: string }[] = [];
  for (const a of answers) {
    if (typeof a === 'object' && a !== null) {
      const rec = a as Record<string, unknown>;
      if (typeof rec.question_id === 'string' && typeof rec.answer === 'string') {
        asked.push({
          question: questionText.get(rec.question_id) ?? rec.question_id,
          answer: rec.answer,
        });
      }
    }
  }
  const intent = analysis.data?.user_intent ?? null;
  if (intent !== null && intent.trim() !== '') {
    asked.push({ question: 'Ce que l’utilisateur veut comme pub', answer: intent.slice(0, 500) });
  }

  const earlier = previous.data.flatMap((row) => {
    const parsed = strategeStoredSchema.safeParse(row.proposal);
    if (!parsed.success) return [];
    const p = parsed.data;
    return [
      {
        objective: p.objective,
        destination: p.destination,
        angle: p.copy.angle,
        primary_text: p.copy.primary_text.slice(0, 300),
        headline: p.copy.headline.slice(0, 100),
        city_names: p.geo.cities.map((c) => c.name),
      },
    ];
  });

  const input = {
    today: calendarDateIn(ctx.now(), ctx.user.timezone),
    output_language: page?.ad_language === 'en' ? 'en' : 'fr',
    ad_address: page?.ad_address === 'tu' ? 'tu' : 'vous',
    profile: profile.data.profile,
    answers: asked,
    brand_kit:
      kit === null ? null : { phone: kit.phone, whatsapp: kit.whatsapp, tagline: kit.tagline },
    account_state: {
      has_whatsapp_linked: page?.whatsapp_linked === true,
      has_instagram_linked: (page?.instagram_account_id ?? null) !== null,
      pixels: (page?.pixel_ids ?? []).map((id) => ({ id, name: `Pixel ${id}`, active: true })),
    },
    user_constraints: {},
    previous_proposals: earlier.reverse(),
  };
  return {
    input,
    summary: {
      business_id: workspaceId,
      language: input.output_language,
      ad_address: input.ad_address,
      answers: asked.length,
      previous_proposals: earlier.length,
      pixels: input.account_state.pixels.length,
    },
  };
}

/** Réserve la ligne de génération : numéro de version suivant, clé d'idempotence unique. */
async function claim(
  ctx: MemberCtx,
  campaignId: string,
  key: string,
): Promise<{ kind: 'claimed'; row: ProposalRow } | { kind: 'existing'; row: ProposalRow }> {
  for (let attempt = 0; attempt < MAX_VERSION_ATTEMPTS; attempt += 1) {
    const latest = await ctx.svc
      .from('campaign_proposals')
      .select('version')
      .eq('workspace_id', ctx.workspace.id)
      .eq('campaign_id', campaignId)
      .order('version', { ascending: false })
      .limit(1);
    if (latest.error !== null) throw db(latest.error);
    const version = (latest.data[0]?.version ?? 0) + 1;
    const inserted = await ctx.svc
      .from('campaign_proposals')
      .insert({
        workspace_id: ctx.workspace.id,
        campaign_id: campaignId,
        version,
        proposal: {},
        status: 'generating',
        idempotency_key: key,
        created_by: ctx.user.id,
      })
      .select(PROPOSAL_COLUMNS)
      .single();
    if (inserted.error === null) return { kind: 'claimed', row: inserted.data };
    if (inserted.error.code !== '23505') throw db(inserted.error);

    // Doublon : soit la clé existe déjà (renvoi), soit un autre numéro de version a été pris entre-temps.
    const existing = await ctx.svc
      .from('campaign_proposals')
      .select(PROPOSAL_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('campaign_id', campaignId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (existing.error !== null) throw db(existing.error);
    if (existing.data !== null) return { kind: 'existing', row: existing.data };
  }
  throw conflict('version_race');
}

/**
 * Enregistre l'issue d'une génération ; rend `true` seulement si une ligne a RÉELLEMENT été modifiée.
 * Une génération lente peut avoir été marquée « expirée » par un renvoi de la même clé : son résultat valide (déjà payé)
 * est alors quand même enregistré. Toute autre ligne (supprimée, déjà terminée, échec d'une autre nature) n'est pas
 * réutilisable : on rend `false` et l'appelant ne consomme rien.
 */
async function settle(
  ctx: MemberCtx,
  rowId: string,
  values: {
    status: 'ready' | 'failed';
    proposal?: NonNullable<Json>;
    agent_run_id?: string | null;
    error_code?: string | null;
  },
): Promise<boolean> {
  const patch: TablesUpdate<'campaign_proposals'> = {
    status: values.status,
    error_code: values.error_code ?? null,
  };
  if (values.proposal !== undefined) patch.proposal = values.proposal;
  if (values.agent_run_id !== undefined) patch.agent_run_id = values.agent_run_id;
  const done = await ctx.svc
    .from('campaign_proposals')
    .update(patch)
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', rowId)
    .eq('status', 'generating')
    .select('id');
  if (done.error !== null) throw db(done.error);
  if (done.data.length > 0) return true;
  if (values.status !== 'ready') return false;
  const late = await ctx.svc
    .from('campaign_proposals')
    .update(patch)
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', rowId)
    .eq('status', 'failed')
    .eq('error_code', EXPIRED)
    .select('id');
  if (late.error !== null) throw db(late.error);
  return late.data.length > 0;
}

export interface RunOptions {
  /** Aperçu : un champ terminé, dans l'ordre d'écriture. Non contractuel : seule la proposition rendue fait foi. */
  onField?: (event: FieldEvent) => void;
  /** Le nouvel essai commence : l'aperçu déjà montré va être remplacé. */
  onRetry?: () => void;
  /** Annulation (délai maximal du flux). Une déconnexion du client n'annule PAS la génération (reprise possible). */
  signal?: AbortSignal;
}

export type ProposalStart =
  | { kind: 'replay'; proposal: ProposalView }
  | { kind: 'run'; run: (options?: RunOptions) => Promise<ProposalView> };

/**
 * Première moitié de la génération : contrôles, réservation de la ligne (clé d'idempotence). Toute erreur ici (404, 409,
 * 403, échec rejoué…) part AVANT le début d'un flux, en réponse HTTP normale. Une proposition déjà prête est rejouée
 * sans aucun appel au modèle.
 */
export async function startProposal(
  ctx: MemberCtx,
  campaignId: string,
  options: GenerateOptions,
  deps: ProposalDeps,
): Promise<ProposalStart> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const campaign = await loadCampaignRow(ctx, campaignId);
  if (campaign.status !== 'draft' || !campaign.editable) throw conflict('campaign_not_editable');

  const claimed = await claim(ctx, campaignId, options.idempotencyKey);
  if (claimed.kind === 'existing') {
    return { kind: 'replay', proposal: await replay(ctx, campaign, claimed.row, deps) };
  }
  const row = claimed.row;
  return {
    kind: 'run',
    run: (runOptions = {}) => execute(ctx, campaign, row, deps, { ...runOptions, ...options }),
  };
}

export async function generateProposal(
  ctx: MemberCtx,
  campaignId: string,
  options: GenerateOptions,
  deps: ProposalDeps,
): Promise<ProposalView> {
  const started = await startProposal(ctx, campaignId, options, deps);
  return started.kind === 'replay' ? started.proposal : started.run({});
}

async function execute(
  ctx: MemberCtx,
  campaign: CampaignRow,
  row: ProposalRow,
  deps: ProposalDeps,
  options: RunOptions & GenerateOptions,
): Promise<ProposalView> {
  // Vrai dès que S24 a pu réserver quelque chose (beforeSpend a réussi) : tout échec ensuite doit le rendre (release).
  let reserved = false;
  try {
    // 1. Validation d'entrée AVANT toute réservation : une entrée invalide ne coûte rien et n'a rien à rendre.
    const material = await gatherInput(ctx, campaign);
    const input = strategeInputSchema.parse(material.input);
    const config = await deps.configs.get('stratege');
    const definition = strategeAgent(config, input);
    const injection = prepareStrategeMessage(input).injectionSuspected;
    const copyContext = strategeCopyContext(input);

    // 2. Quotas et crédits (S24) : après la réservation de la ligne et la validation, avant l'appel au modèle.
    await deps.beforeSpend?.(campaign.id, ctx.workspace.id);
    reserved = true;

    // Aperçu : un champ n'est montré que s'il est complet, autorisé, et sans invention (R3) ; jamais enregistré.
    const onField = options.onField;
    const stream =
      onField === undefined
        ? undefined
        : createFieldStream((event) => {
            if (!previewAllowed(event, input.today, copyContext)) return;
            onField(event);
          });

    let output: StrategeOutput;
    let runId: string | null;
    try {
      const result = await runAgent(definition, input, {
        workspaceId: ctx.workspace.id,
        gateway: deps.gateway,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(deps.keys === undefined ? {} : { keys: deps.keys }),
        ...(stream === undefined
          ? {}
          : {
              onText: (delta: string) => {
                stream.push(delta);
              },
            }),
        ...(options.onRetry === undefined ? {} : { onRetry: options.onRetry }),
      });
      output = result.output;
      runId = await journalAgentRun(ctx.svc, result.run, material.summary, ctx.workspace.id);
    } catch (error) {
      if (error instanceof AgentRunError) {
        await journalAgentRun(ctx.svc, error.run, material.summary, ctx.workspace.id);
      }
      throw error;
    }

    const stored: StrategeOutput = injection
      ? { ...output, flags: [...new Set([...output.flags, 'PROMPT_INJECTION_SUSPECTED'])] }
      : output;

    // 3. Enregistrement : le résultat n'est « accepté » que si la ligne l'est réellement.
    const saved = await settle(ctx, row.id, {
      status: 'ready',
      proposal: stored,
      agent_run_id: runId,
    });
    if (!saved) throw new AppError('conflict', { meta: { reason: 'generation_expired' } });

    // 4. Consommation (S24) seulement APRÈS l'enregistrement. Un échec ici ne jette pas une proposition déjà payée :
    //    elle reste enregistrée et l'erreur est journalisée (S24 rattrapera la consommation).
    try {
      await deps.afterAccepted?.(campaign.id, ctx.workspace.id, row.version);
    } catch (hookError) {
      logger.error('Consommation après proposition échouée', {
        campaignId: campaign.id,
        version: row.version,
        err: hookError,
      });
    }
    const settled = await ctx.svc
      .from('campaign_proposals')
      .select(PROPOSAL_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', row.id)
      .single();
    if (settled.error !== null) throw db(settled.error);
    return await viewOf(ctx, campaign, settled.data);
  } catch (error) {
    const code: ErrorCode = error instanceof AppError ? error.code : 'internal_error';
    // L'échec est enregistré (même clé = même réponse) ; aucune relance automatique.
    await settle(ctx, row.id, { status: 'failed', error_code: code }).catch(() => undefined);
    if (reserved) {
      // Rend ce que beforeSpend a réservé : aucune réservation orpheline après un échec.
      try {
        await deps.release?.(campaign.id, ctx.workspace.id, row.version);
      } catch (releaseError) {
        logger.error('Libération après échec impossible', {
          campaignId: campaign.id,
          version: row.version,
          err: releaseError,
        });
      }
    }
    throw error;
  }
}

async function replay(
  ctx: MemberCtx,
  campaign: CampaignRow,
  row: ProposalRow,
  deps: ProposalDeps,
): Promise<ProposalView> {
  if (row.status === 'ready') return viewOf(ctx, campaign, row);
  if (row.status === 'failed') throw errorFromCode(row.error_code);
  // « generating » : encore en cours, ou perdue si le processus s'est arrêté.
  const age = ctx.now().getTime() - new Date(row.created_at).getTime();
  if (age > (deps.staleAfterMs ?? DEFAULT_STALE_MS)) {
    await settle(ctx, row.id, { status: 'failed', error_code: EXPIRED });
    throw new AppError('provider_unavailable');
  }
  throw new AppError('conflict', {
    retryAfterS: 2,
    meta: { reason: 'generation_in_progress' },
  });
}

// ---- Choix -----------------------------------------------------------------------------------------------------------

export async function chooseProposal(
  ctx: MemberCtx,
  campaignId: string,
  version: number,
  campaignVersion: number,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const campaign = await loadCampaignRow(ctx, campaignId);
  if (campaign.status !== 'draft' || !campaign.editable) throw conflict('campaign_not_editable');
  // Version lue par le client : si le brouillon a changé depuis (autre onglet, collègue), on refuse au lieu d'écraser (EC-TEAM-08).
  if (campaign.version !== campaignVersion) {
    throw new AppError('conflict', {
      meta: { current_version: campaign.version, reason: 'stale_version' },
    });
  }

  const found = await ctx.db
    .from('campaign_proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('workspace_id', ctx.workspace.id)
    .eq('campaign_id', campaignId)
    .eq('version', version)
    .eq('status', 'ready')
    .maybeSingle();
  if (found.error !== null) throw db(found.error);
  if (found.data === null) throw new AppError('not_found');
  const parsed = strategeStoredSchema.safeParse(found.data.proposal);
  if (!parsed.success) throw conflict('stored_proposal_invalid');
  const p = parsed.data;

  // Le serveur revalide tout, comme pour une modification : une date devenue passée est refusée.
  const targeting = {
    ...readJson(targetingSchema, campaign.targeting, {}),
    age_min: p.advanced_targeting.age_min,
    age_max: p.advanced_targeting.age_max,
    genders: p.advanced_targeting.genders,
    advantage_plus: p.advanced_targeting.advantage_plus,
  };
  checkCampaignFields(
    {
      objective: p.objective,
      destination: p.destination,
      dailyBudgetUsdCents: p.budget.daily_usd_cents,
      startDate: p.schedule.start_date,
      endDate: p.schedule.end_date,
      copy: p.copy,
      targeting,
      geo: { countries: p.geo.countries, cities: p.geo.cities },
    },
    new Set([
      'objective',
      'destination',
      'daily_budget_usd_cents',
      'start_date',
      'end_date',
      'copy',
      'targeting',
      'geo',
    ]),
    calendarDateIn(ctx.now(), ctx.user.timezone),
  );

  const costContext = await loadCostContext(ctx);
  const written = await ctx.svc
    .from('campaigns')
    .update({
      objective: p.objective,
      destination: p.destination,
      optimization_goal: p.optimization_goal,
      geo: compact({ countries: p.geo.countries, cities: p.geo.cities }),
      targeting: compact(targeting),
      daily_budget_usd_cents: p.budget.daily_usd_cents,
      start_date: p.schedule.start_date,
      end_date: p.schedule.end_date,
      copy: compact(p.copy),
      tracking: p.tracking,
      visual_brief: p.visual_brief === '' ? null : p.visual_brief,
      chosen_proposal_version: version,
      fx_rate_xaf: costContext.fx?.rate ?? null,
    })
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', campaignId)
    // Verrou optimiste : si quelqu'un a modifié le brouillon depuis notre lecture, rien n'est écrasé (EC-TEAM-08).
    .eq('version', campaignVersion)
    .eq('status', 'draft')
    .select(CAMPAIGN_COLUMNS);
  if (written.error !== null) throw db(written.error);
  if (written.data[0] === undefined) {
    const latest = await loadCampaignRow(ctx, campaignId);
    throw new AppError('conflict', {
      meta: { current_version: latest.version, reason: 'stale_version' },
    });
  }

  // Une seule proposition retenue : on libère l'ancienne avant de marquer la nouvelle (index unique partiel).
  const cleared = await ctx.svc
    .from('campaign_proposals')
    .update({ chosen: false })
    .eq('workspace_id', ctx.workspace.id)
    .eq('campaign_id', campaignId)
    .eq('chosen', true);
  if (cleared.error !== null) throw db(cleared.error);
  const marked = await ctx.svc
    .from('campaign_proposals')
    .update({ chosen: true })
    .eq('workspace_id', ctx.workspace.id)
    .eq('campaign_id', campaignId)
    .eq('version', version);
  if (marked.error !== null) throw db(marked.error);

  const updated = written.data[0];
  return toCampaignView(updated, costContext);
}
