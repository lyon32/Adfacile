// Explication d'un refus par le Modérateur (S18, docs/agents/04, APPFLOW §12).
//
// Le Modérateur n'est appelé QU'APRÈS un refus de Meta (jamais avant la publication) et UNE seule fois par refus : l'état
// `pending → running` est pris par une écriture gardée (deux exécutions simultanées ou une tâche rejouée : une seule appelle le
// modèle). Un appel dont le résultat est incertain n'est JAMAIS relancé d'office (EC-META-05) : l'échec est enregistré
// (`explain_status = failed`, `explain_error`) et l'écran montre le motif de Meta tel quel avec la marche à suivre.
//
// Contenu non fiable (R8) : le motif vient de Meta, les textes de la pub viennent du client ; l'agent les encadre et nettoie
// (`wrapUntrusted`, `detectInjection`). Une consigne repérée ajoute `PROMPT_INJECTION_SUSPECTED` au rapport (jamais montré à
// l'écran). Le journal `agent_runs` garde un résumé, jamais les textes (R11).
import {
  AgentRunError,
  createAiGateway,
  EnvAgentConfigSource,
  isAnonymousPattern,
  moderateurAgent,
  moderateurInputSchema,
  prepareModerateurMessage,
  runAgent,
  type AgentConfigSource,
  type AgentKeyStore,
  type AiGateway,
  type FakeAiGatewayOptions,
  type ModerateurOutput,
} from '@pubeka/agents';
import { AppError } from '@pubeka/contracts';
import { unwrap, type Json, type ServiceClient, type TablesUpdate } from '@pubeka/db';
import { createLogger, type Env } from '@pubeka/shared';
import { journalAgentRun } from '../../agent-journal';
import type { ServiceCtx } from '../../context';
import { copySchema, readJson } from '../campaign-schemas';
import { fakeModerateurOutput } from './fake-moderateur';
import { REJECTION_COLUMNS, toRejectionRow, type RejectionRow } from './rejection-view';

const logger = createLogger({ base: { module: 'explain-rejection' } });

export interface ExplainDeps {
  gateway: AiGateway;
  configs: AgentConfigSource;
  keys?: AgentKeyStore;
}

export type ExplainEnv = Pick<
  Env,
  'PUBEKA_FAKE_PROVIDERS' | 'OPENROUTER_API_KEY' | 'OPENROUTER_DATA_COLLECTION' | 'AGENT_MODELS'
>;

/** Avec `PUBEKA_FAKE_PROVIDERS` contenant `ai`, la fausse passerelle est servie (aucune dépense). */
export function createExplainDeps(env: ExplainEnv, fake: FakeAiGatewayOptions = {}): ExplainDeps {
  return {
    gateway: createAiGateway(env, {
      dynamicFixtures: { moderateur: fakeModerateurOutput },
      ...fake,
    }),
    configs: new EnvAgentConfigSource(env.AGENT_MODELS),
  };
}

export type ExplainOutcome = 'explained' | 'skipped' | 'failed';

function db(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(source: unknown, key: string): unknown {
  return isRecord(source) ? (source[key] ?? null) : null;
}

interface AdMaterial {
  language: 'fr' | 'en';
  input: unknown;
  /** Textes du client (jamais écrits dans la mémoire des refus). */
  clientTexts: string[];
  summary: NonNullable<Json>;
}

/** Tout ce que le Modérateur a le droit de voir, relu en base côté serveur (rien ne vient du navigateur). */
async function gatherMaterial(svc: ServiceClient, rejection: RejectionRow): Promise<AdMaterial> {
  const campaign = unwrap<{
    name: string;
    copy: unknown;
    destination: string | null;
    visual_brief: string | null;
    analysis_id: string | null;
  } | null>(
    await svc
      .from('campaigns')
      .select('name, copy, destination, visual_brief, analysis_id')
      .eq('workspace_id', rejection.workspace_id)
      .eq('id', rejection.campaign_id)
      .maybeSingle(),
  );
  if (campaign === null) throw new AppError('not_found');

  const workspace = unwrap<{ owner_id: string } | null>(
    await svc.from('workspaces').select('owner_id').eq('id', rejection.workspace_id).maybeSingle(),
  );
  let language: 'fr' | 'en' = 'fr';
  if (workspace !== null) {
    const profile = unwrap<{ ui_language: string } | null>(
      await svc.from('profiles').select('ui_language').eq('id', workspace.owner_id).maybeSingle(),
    );
    if (profile?.ui_language === 'en') language = 'en';
  }

  let product = campaign.name;
  let website: string | null = null;
  if (campaign.analysis_id !== null) {
    const analysis = unwrap<{ business_profile_id: string | null } | null>(
      await svc
        .from('analyses')
        .select('business_profile_id')
        .eq('workspace_id', rejection.workspace_id)
        .eq('id', campaign.analysis_id)
        .maybeSingle(),
    );
    if (analysis?.business_profile_id !== null && analysis?.business_profile_id !== undefined) {
      const business = unwrap<{ profile: unknown } | null>(
        await svc
          .from('business_profiles')
          .select('profile')
          .eq('workspace_id', rejection.workspace_id)
          .eq('id', analysis.business_profile_id)
          .maybeSingle(),
      );
      const profile = business?.profile;
      const products = field(profile, 'products');
      const firstProduct: unknown = Array.isArray(products) ? products.at(0) : null;
      product =
        str(field(firstProduct, 'name')) ??
        str(field(field(profile, 'business_name'), 'value')) ??
        product;
      website = str(field(field(profile, 'contacts'), 'website'));
    }
  }

  const copy = readJson(copySchema, campaign.copy, {});
  const landing =
    campaign.destination === 'WEBSITE'
      ? website
      : campaign.destination === null
        ? null
        : 'messagerie';
  const input = {
    output_language: language,
    ad: {
      product,
      primary_text: copy.primary_text ?? '',
      headline: copy.headline ?? '',
      description: copy.description ?? null,
      visual: campaign.visual_brief ?? 'Photo envoyée par le client',
      landing_page: landing,
    },
    meta_rejection: rejection.meta_reason ?? 'Refus sans motif communiqué par Meta.',
  };
  return {
    language,
    input,
    clientTexts: [copy.primary_text ?? '', copy.headline ?? '', copy.description ?? '', product],
    // Le journal garde un RÉSUMÉ : jamais les textes du client (R11).
    summary: {
      rejection_id: rejection.id,
      campaign_id: rejection.campaign_id,
      language,
      ad_fields: ['product', 'primary_text', 'headline', 'description', 'visual', 'landing_page'],
    },
  };
}

async function settle(
  svc: ServiceClient,
  rejection: RejectionRow,
  patch: TablesUpdate<'rejections'>,
): Promise<boolean> {
  const written = await svc
    .from('rejections')
    .update(patch)
    .eq('workspace_id', rejection.workspace_id)
    .eq('id', rejection.id)
    .eq('explain_status', 'running')
    .select('id');
  if (written.error !== null) throw db(written.error);
  return written.data.length > 0;
}

async function remember(svc: ServiceClient, pattern: string, now: Date): Promise<void> {
  try {
    const result = await svc.rpc('record_rejection_pattern', {
      p_pattern: pattern,
      p_now: now.toISOString(),
    });
    if (result.error !== null) {
      logger.error('Mémoire des refus non écrite', { code: result.error.code });
    }
  } catch (error) {
    logger.error('Mémoire des refus non écrite', { err: error });
  }
}

/**
 * Explique UN refus. Rejouable sans double effet : seul le passage `pending → running` appelle le modèle. Ne lance jamais :
 * un échec est enregistré sur le refus.
 */
export async function explainRejection(
  ctx: ServiceCtx,
  deps: ExplainDeps,
  ref: { rejectionId: string; workspaceId: string },
): Promise<ExplainOutcome> {
  const claimed = await ctx.svc
    .from('rejections')
    .update({
      explain_status: 'running',
      explain_error: null,
      explain_started_at: ctx.now().toISOString(),
    })
    .eq('workspace_id', ref.workspaceId)
    .eq('id', ref.rejectionId)
    .eq('explain_status', 'pending')
    .select(REJECTION_COLUMNS);
  if (claimed.error !== null) throw db(claimed.error);
  const first = claimed.data[0];
  if (first === undefined) return 'skipped';
  const rejection = toRejectionRow(first);

  const fail = async (code: string): Promise<ExplainOutcome> => {
    await settle(ctx.svc, rejection, { explain_status: 'failed', explain_error: code }).catch(
      (error: unknown) => {
        logger.error('Échec d’explication non enregistré', { err: error });
      },
    );
    return 'failed';
  };

  try {
    const material = await gatherMaterial(ctx.svc, rejection);
    const parsed = moderateurInputSchema.safeParse(material.input);
    if (!parsed.success) return await fail('validation_failed');
    const config = await deps.configs.get('moderateur');
    const definition = moderateurAgent(config, parsed.data);
    const injection = prepareModerateurMessage(parsed.data).injectionSuspected;

    let output: ModerateurOutput;
    try {
      const result = await runAgent(definition, parsed.data, {
        workspaceId: rejection.workspace_id,
        gateway: deps.gateway,
        ...(deps.keys === undefined ? {} : { keys: deps.keys }),
      });
      output = result.output;
      await journalAgentRun(ctx.svc, result.run, material.summary, rejection.workspace_id);
    } catch (error) {
      if (error instanceof AgentRunError) {
        await journalAgentRun(ctx.svc, error.run, material.summary, rejection.workspace_id);
      }
      throw error;
    }

    const stored = injection
      ? { ...output, flags: ['PROMPT_INJECTION_SUSPECTED'] }
      : { ...output, flags: [] };
    const saved = await settle(ctx.svc, rejection, {
      explain_status: 'ready',
      explain_error: null,
      report: stored,
      memory_pattern: output.memory_pattern,
    });
    if (!saved) return 'skipped';
    // Mémoire des refus : anonyme ou rien (aucune donnée personnelle ni suite de mots du texte du client).
    if (isAnonymousPattern(output.memory_pattern, material.clientTexts)) {
      await remember(ctx.svc, output.memory_pattern, ctx.now());
    } else {
      logger.warn('Motif non anonyme : la mémoire des refus n’est pas écrite', {
        rejectionId: rejection.id,
      });
    }
    return 'explained';
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'internal_error';
    logger.error('Explication du refus impossible', { rejectionId: rejection.id, code });
    return fail(code);
  }
}

/** Une explication « en cours » plus vieille que cela est considérée perdue (processus mort) : elle passe à « échec ». */
export const EXPLAIN_STALE_MS = 10 * 60_000;

/**
 * Rend « échec » (`explain_timeout`) les explications restées « en cours » au-delà de `EXPLAIN_STALE_MS`, SANS relancer le modèle :
 * un appel au résultat incertain n'est jamais rejoué d'office (EC-META-05). L'écran propose alors les actions manuelles.
 */
export async function failStaleExplanations(
  ctx: ServiceCtx,
  maxAgeMs = EXPLAIN_STALE_MS,
): Promise<number> {
  const cutoff = ctx.now().getTime() - maxAgeMs;
  const running = unwrap<
    {
      id: string;
      workspace_id: string;
      explain_started_at: string | null;
      created_at: string | null;
    }[]
  >(
    await ctx.svc
      .from('rejections')
      .select('id, workspace_id, explain_started_at, created_at')
      .eq('explain_status', 'running')
      .limit(200),
  );
  let failed = 0;
  for (const row of running) {
    // Sans date de prise (créé avant la migration 0019), la date de création fait foi.
    const since = Date.parse(row.explain_started_at ?? row.created_at ?? '');
    if (Number.isNaN(since) || since > cutoff) continue;
    const written = await ctx.svc
      .from('rejections')
      .update({ explain_status: 'failed', explain_error: 'explain_timeout' })
      .eq('workspace_id', row.workspace_id)
      .eq('id', row.id)
      .eq('explain_status', 'running')
      .select('id');
    if (written.error === null && written.data.length > 0) failed += 1;
  }
  return failed;
}

/** Explique les refus en attente (les plus anciens d'abord), au plus `limit` par passage. Ne lance jamais. */
export async function explainPendingRejections(
  ctx: ServiceCtx,
  deps: ExplainDeps,
  limit = 10,
): Promise<{ explained: number; failed: number; skipped: number }> {
  const stale = await failStaleExplanations(ctx).catch((error: unknown) => {
    logger.error('Explications perdues non traitées', { err: error });
    return 0;
  });
  const pending = unwrap<{ id: string; workspace_id: string }[]>(
    await ctx.svc
      .from('rejections')
      .select('id, workspace_id')
      .eq('explain_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(Math.max(1, Math.min(limit, 50))),
  );
  const report = { explained: 0, failed: stale, skipped: 0 };
  for (const item of pending) {
    try {
      const outcome = await explainRejection(ctx, deps, {
        rejectionId: item.id,
        workspaceId: item.workspace_id,
      });
      report[outcome] += 1;
    } catch (error) {
      report.failed += 1;
      logger.error('Explication du refus interrompue', { rejectionId: item.id, err: error });
    }
  }
  return report;
}
