// Tâche d'analyse (LLD §4 « jobs », ARCHITECTURE §10) : lit les sources, appelle l'Analyste, enregistre la fiche et ses
// questions. Elle reçoit des IDENTIFIANTS, recharge tout depuis la base et peut être relancée sans double effet :
//  - le passage `queued → reading` est atomique : une seconde exécution ne trouve rien à prendre et s'arrête (`skipped`) ;
//  - jamais de relance automatique d'un appel IA au résultat incertain (EC-META-05) : un échec est visible et final.
// Ordre voulu pour TR-AGT-06 : un produit illégal est constaté AVANT toute consommation de crédit ou de quota. Le point
// d'accroche `afterAccepted` (S24) n'est appelé que pour une analyse acceptée.
import {
  analysteAgent,
  analysteInputSchema,
  AgentRunError,
  detectInjection,
  groundProfile,
  runAgent,
  type AgentRunRecord,
  type AnalysteImage,
  type AnalysteInput,
  type AnalysteOutput,
  type AnalysteSource,
} from '@pubeka/agents';
import { AppError } from '@pubeka/contracts';
import type { Json } from '@pubeka/db';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from '../context';
import type { RunAnalysisDeps } from './deps';
import { extractDocumentText } from './documents';
import { readSource, type SourceInput } from './read-source';
import { FILE_TYPES, isFileMime, type FileMime } from '../uploads/file-types';

const logger = createLogger({ base: { module: 'analysis' } });

export interface RunAnalysisInput {
  analysisId: string;
  workspaceId: string;
}

export type RunAnalysisOutcome = 'skipped' | 'questions' | 'blocked' | 'failed';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
/** Texte donné au modèle : borné par source et au total pour garder le coût d'une campagne à quelques centimes. */
const MAX_CHARS_PER_SOURCE = 60_000;
const MAX_CHARS_TOTAL = 150_000;
const MAX_IMAGES = 10;

interface AnalysisRecord {
  id: string;
  page_id: string | null;
  user_intent: string | null;
  source_ids: string[];
  created_by: string | null;
}

interface SourceRecord {
  id: string;
  type: string;
  url: string | null;
  file_path: string | null;
  extracted_text: string | null;
}

type Readable =
  | { kind: 'text'; entry: Exclude<AnalysteSource, { type: 'image' }>; text: string }
  | { kind: 'image'; entry: AnalysteSource; image: Omit<AnalysteImage, 'index'> }
  | { kind: 'unreadable' };

function dbError(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

async function fail(
  svc: ServiceCtx['svc'],
  input: RunAnalysisInput,
  code: string,
  flags: string[] = [],
): Promise<void> {
  await svc
    .from('analyses')
    .update({ status: 'failed', error_code: code, flags })
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.analysisId);
}

/** Journal `agent_runs` (R11) : sans le contenu des sources ni les images (données du client, volumineuses). */
async function journal(
  svc: ServiceCtx['svc'],
  run: AgentRunRecord,
  summary: NonNullable<Json>,
  workspaceId: string,
): Promise<void> {
  const inserted = await svc.from('agent_runs').insert({
    workspace_id: workspaceId,
    agent: run.agent,
    model: run.model,
    requested_model: run.requestedModel,
    provider: run.provider,
    attempts: run.attempts,
    error_code: run.errorCode,
    prompt_version: run.promptVersion,
    input: summary,
    ...(run.output === null ? {} : { output: run.output as NonNullable<Json> }),
    valid_schema: run.validSchema,
    retried: run.retried,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    latency_ms: run.latencyMs,
  });
  if (inserted.error !== null)
    logger.error('Journal des agents non écrit', { code: inserted.error.code });
}

async function download(
  svc: ServiceCtx['svc'],
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  const file = await svc.storage.from(bucket).download(path);
  if (file.error !== null) return null;
  return new Uint8Array(await file.data.arrayBuffer());
}

async function readOne(
  ctx: ServiceCtx,
  workspaceId: string,
  record: SourceRecord,
  index: number,
  deps: RunAnalysisDeps,
): Promise<Readable> {
  const options = {
    timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: deps.maxBytes ?? DEFAULT_MAX_BYTES,
  };
  const save = async (text: string, extractor: 'internal' | 'jina' | null, ok: boolean) => {
    await ctx.svc
      .from('sources')
      .update({
        extracted_text: ok ? text : null,
        extractor,
        status: ok ? 'ok' : 'unreadable',
      })
      .eq('workspace_id', workspaceId)
      .eq('id', record.id);
  };

  switch (record.type) {
    case 'website':
    case 'app_link':
    case 'social_post': {
      const read = await readSource(
        { type: record.type, url: record.url ?? '' } satisfies SourceInput,
        options,
        {
          ...(deps.resolve === undefined ? {} : { resolve: deps.resolve }),
          ...(deps.transport === undefined ? {} : { transport: deps.transport }),
          jina: deps.jina,
        },
      );
      await save(read.text, read.extractor, read.status === 'ok');
      if (read.status !== 'ok') return { kind: 'unreadable' };
      return {
        kind: 'text',
        text: read.text,
        entry: { type: record.type, url: record.url ?? '', extracted_text: read.text },
      };
    }
    case 'text': {
      const text = record.extracted_text ?? '';
      return text === ''
        ? { kind: 'unreadable' }
        : { kind: 'text', text, entry: { type: 'text', content: text } };
    }
    case 'document': {
      const verified = await ctx.svc
        .from('uploads')
        .select('bucket, verified_mime, status')
        .eq('workspace_id', workspaceId)
        .eq('file_path', record.file_path ?? '')
        .maybeSingle();
      const row = verified.data;
      if (row?.status !== 'verified' || row.verified_mime === null) {
        return { kind: 'unreadable' };
      }
      const mime = row.verified_mime;
      const bytes = isFileMime(mime)
        ? await download(ctx.svc, row.bucket, record.file_path ?? '')
        : null;
      if (bytes === null || !isFileMime(mime)) return { kind: 'unreadable' };
      try {
        const text = await extractDocumentText(bytes, mime);
        await save(text, 'internal', text !== '');
        if (text === '') return { kind: 'unreadable' };
        const filename = `document.${FILE_TYPES[mime].ext}`;
        return { kind: 'text', text, entry: { type: 'document', filename, extracted_text: text } };
      } catch {
        await save('', 'internal', false);
        return { kind: 'unreadable' };
      }
    }
    case 'image': {
      const upload = await ctx.svc
        .from('uploads')
        .select('bucket, verified_mime, status')
        .eq('workspace_id', workspaceId)
        .eq('file_path', record.file_path ?? '')
        .maybeSingle();
      const row = upload.data;
      const mime: string | null = row?.verified_mime ?? null;
      if (row?.status !== 'verified' || mime === null) return { kind: 'unreadable' };
      const bytes = await download(ctx.svc, row.bucket, record.file_path ?? '');
      if (bytes === null || !isImageMime(mime)) return { kind: 'unreadable' };
      return {
        kind: 'image',
        entry: { type: 'image', role: 'product' },
        image: { mime, base64: Buffer.from(bytes).toString('base64') },
      };
    }
    default:
      return { kind: 'unreadable' };
  }
}

function isImageMime(value: string): value is Extract<FileMime, `image/${string}`> {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

/** Un modèle du réglage (principal ou de secours) dont on SAIT qu'il ne voit pas les images. */
async function lacksVision(
  deps: RunAnalysisDeps,
  models: readonly (string | undefined)[],
): Promise<boolean> {
  for (const model of models) {
    if (model !== undefined && (await deps.catalog.acceptsImages(model)) === false) return true;
  }
  return false;
}

function summarize(
  input: AnalysteInput,
  texts: readonly string[],
  injection: readonly string[],
  imagesSent: number,
): NonNullable<Json> {
  return {
    business_id: input.business_id,
    locale: input.locale,
    sources: input.sources.map((s, index) => ({ index, type: s.type })),
    text_chars: texts.reduce((n, t) => n + t.length, 0),
    images: imagesSent,
    has_user_intent: input.user_intent !== null && input.user_intent !== undefined,
    injection_reasons: [...injection],
  };
}

export async function runAnalysis(
  ctx: ServiceCtx,
  input: RunAnalysisInput,
  deps: RunAnalysisDeps,
): Promise<{ outcome: RunAnalysisOutcome }> {
  const { svc } = ctx;
  const { workspaceId, analysisId } = input;

  // 1. Prendre l'analyse : atomique, une seule exécution peut passer de « queued » à « reading ».
  const claimed = await svc
    .from('analyses')
    .update({ status: 'reading' })
    .eq('workspace_id', workspaceId)
    .eq('id', analysisId)
    .eq('status', 'queued')
    .select('id, page_id, user_intent, source_ids, created_by');
  if (claimed.error !== null) throw dbError(claimed.error);
  const analysis: AnalysisRecord | undefined = claimed.data[0];
  if (analysis === undefined) return { outcome: 'skipped' };

  try {
    return await analyse(ctx, input, analysis, deps);
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'internal_error';
    if (!(error instanceof AppError)) logger.error('Analyse en échec', { analysisId, err: error });
    await fail(svc, input, code);
    return { outcome: 'failed' };
  }
}

async function analyse(
  ctx: ServiceCtx,
  input: RunAnalysisInput,
  analysis: AnalysisRecord,
  deps: RunAnalysisDeps,
): Promise<{ outcome: RunAnalysisOutcome }> {
  const { svc } = ctx;
  const { workspaceId, analysisId } = input;

  // 2. Recharger le contexte depuis la base (identifiants seulement dans la charge de la tâche).
  const [profileQuery, sourcesQuery, kitQuery] = await Promise.all([
    analysis.created_by === null
      ? Promise.resolve({ data: null, error: null })
      : svc
          .from('profiles')
          .select('ui_language, country_code, currency_display')
          .eq('id', analysis.created_by)
          .maybeSingle(),
    svc
      .from('sources')
      .select('id, type, url, file_path, extracted_text')
      .eq('workspace_id', workspaceId)
      .in('id', analysis.source_ids),
    analysis.page_id === null
      ? Promise.resolve({ data: null, error: null })
      : svc
          .from('brand_kits')
          .select('phone, whatsapp, tagline, tone')
          .eq('workspace_id', workspaceId)
          .eq('page_id', analysis.page_id)
          .maybeSingle(),
  ]);
  if (profileQuery.error !== null) throw dbError(profileQuery.error);
  if (sourcesQuery.error !== null) throw dbError(sourcesQuery.error);
  if (kitQuery.error !== null) throw dbError(kitQuery.error);
  const byId = new Map(sourcesQuery.data.map((s) => [s.id, s]));
  const records = analysis.source_ids.flatMap((id) => {
    const found = byId.get(id);
    return found === undefined ? [] : [found];
  });
  const outputLanguage = profileQuery.data?.ui_language === 'en' ? 'en' : 'fr';

  // 3. Lire les sources (un site illisible n'arrête pas les autres : EC-SRC-03).
  const entries: AnalysteSource[] = [];
  const images: AnalysteImage[] = [];
  const texts: string[] = [];
  const unreadable: number[] = [];
  let budget = MAX_CHARS_TOTAL;
  for (const [index, record] of records.entries()) {
    const read = await readOne(ctx, workspaceId, record, index, deps);
    if (read.kind === 'unreadable') {
      unreadable.push(index);
      entries.push({ type: 'text', content: '' });
      continue;
    }
    if (read.kind === 'image') {
      if (images.length < MAX_IMAGES) images.push({ index, ...read.image });
      entries.push(read.entry);
      continue;
    }
    const text = read.text.slice(0, Math.min(MAX_CHARS_PER_SOURCE, Math.max(0, budget)));
    budget -= text.length;
    texts.push(text);
    entries.push(
      read.entry.type === 'text'
        ? { type: 'text', content: text.slice(0, 5000) }
        : { ...read.entry, extracted_text: text },
    );
  }
  // Les sources illisibles sont retirées de l'entrée de l'agent ; leurs index restent signalés à l'écran.
  const usable = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !unreadable.includes(index));
  const remap = new Map(usable.map(({ index }, position) => [index, position]));
  const agentSources = usable.map(({ entry }) => entry);
  const agentImages = images.flatMap((image) => {
    const position = remap.get(image.index);
    return position === undefined ? [] : [{ ...image, index: position }];
  });

  const flags: string[] = [];
  if (agentSources.length === 0 || (texts.length === 0 && agentImages.length === 0)) {
    await svc
      .from('analyses')
      .update({ unreadable_sources: unreadable })
      .eq('workspace_id', workspaceId)
      .eq('id', analysisId);
    await fail(svc, input, 'source_unreadable');
    return { outcome: 'failed' };
  }

  // 4. Contenu non fiable : les tentatives d'injection sont signalées et IGNORÉES, l'analyse continue (EC-SRC-05).
  const injection = texts.flatMap((t) => detectInjection(t).reasons);
  if (injection.length > 0) flags.push('PROMPT_INJECTION_SUSPECTED');
  if (analysis.user_intent !== null && detectInjection(analysis.user_intent).suspicious) {
    if (!flags.includes('PROMPT_INJECTION_SUSPECTED')) flags.push('PROMPT_INJECTION_SUSPECTED');
  }

  // 5. Les photos exigent un modèle qui voit les images : sinon on le dit clairement, avant tout appel (aucune dépense).
  const config = await deps.configs.get('analyste');
  let sendImages = agentImages;
  let sources = agentSources;
  if (agentImages.length > 0 && (await lacksVision(deps, [config.model, config.fallbackModel]))) {
    if (texts.length === 0) {
      await svc
        .from('analyses')
        .update({ unreadable_sources: unreadable })
        .eq('workspace_id', workspaceId)
        .eq('id', analysisId);
      await fail(svc, input, 'provider_unavailable', [...flags, 'MODEL_WITHOUT_VISION']);
      return { outcome: 'failed' };
    }
    flags.push('IMAGES_NOT_READ');
    sendImages = [];
    sources = agentSources.filter((s) => s.type !== 'image');
  }

  await svc
    .from('analyses')
    .update({ status: 'analysing', unreadable_sources: unreadable })
    .eq('workspace_id', workspaceId)
    .eq('id', analysisId);

  // 6. Appeler l'Analyste (au plus deux appels, TR-AGT-01) et journaliser quoi qu'il arrive (R11).
  const kit = kitQuery.data;
  const agentInput = {
    business_id: workspaceId,
    locale: {
      country: profileQuery.data?.country_code ?? 'CM',
      currency_display: profileQuery.data?.currency_display ?? 'XAF',
      output_language: outputLanguage,
    },
    brand_kit:
      kit === null
        ? null
        : {
            phone: kit.phone,
            whatsapp: kit.whatsapp,
            tagline: kit.tagline,
            tone: kit.tone === null ? null : toneOf(kit.tone),
          },
    sources,
    images: sendImages,
    user_intent: analysis.user_intent,
  } satisfies AnalysteInput;
  const parsedInput = analysteInputSchema.parse(agentInput);
  const logged = summarize(agentInput, texts, injection.slice(0, 20), sendImages.length);

  let output: AnalysteOutput;
  let run: AgentRunRecord;
  try {
    const result = await runAgent(analysteAgent(config), parsedInput, {
      workspaceId,
      gateway: deps.gateway,
      ...(deps.keys === undefined ? {} : { keys: deps.keys }),
    });
    output = result.output;
    run = result.run;
  } catch (error) {
    if (error instanceof AgentRunError) {
      await journal(svc, error.run, logged, workspaceId);
      await fail(svc, input, error.code, flags);
      return { outcome: 'failed' };
    }
    throw error;
  }
  await journal(svc, run, logged, workspaceId);

  // 7. R3 : aucune valeur sans source (le contrôle est fait par le code, pas seulement par le prompt).
  const imageSourceIndexes = sendImages.map((i) => i.index);
  const grounded = groundProfile(output, {
    texts: [...texts, ...records.flatMap((r) => (r.url === null ? [] : [r.url]))],
    brandKit: kit,
    hasImages: sendImages.length > 0,
    imageSources: imageSourceIndexes,
  });
  const final = grounded.output;
  const allFlags = [...new Set([...flags, ...final.flags])];

  // 8. Produit illégal évident : arrêt AVANT toute dépense de crédits ou de quota (TR-AGT-06, EC-SRC-06).
  const illegal = allFlags.includes('ILLEGAL_PRODUCT');
  const stored = await svc
    .from('business_profiles')
    .insert({
      workspace_id: workspaceId,
      page_id: analysis.page_id,
      profile: final.profile as unknown as NonNullable<Json>,
      conflicts: final.conflicts as unknown as NonNullable<Json>,
      sensitive_signals: final.sensitive_signals,
      flags: allFlags,
      questions: (illegal ? [] : final.questions) as unknown as NonNullable<Json>,
      answers: [],
    })
    .select('id')
    .single();
  if (stored.error !== null) throw dbError(stored.error);

  if (illegal) {
    await svc
      .from('analyses')
      .update({
        status: 'blocked',
        blocked_reason: 'illegal_product',
        business_profile_id: stored.data.id,
        flags: allFlags,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', analysisId);
    return { outcome: 'blocked' };
  }

  await deps.afterAccepted?.(analysisId, workspaceId);
  await svc
    .from('analyses')
    .update({ status: 'questions', business_profile_id: stored.data.id, flags: allFlags })
    .eq('workspace_id', workspaceId)
    .eq('id', analysisId);
  return { outcome: 'questions' };
}

function toneOf(value: string): 'premium' | 'friendly' | 'bold' | 'serious' | 'playful' | null {
  return value === 'premium' ||
    value === 'friendly' ||
    value === 'bold' ||
    value === 'serious' ||
    value === 'playful'
    ? value
    : null;
}
