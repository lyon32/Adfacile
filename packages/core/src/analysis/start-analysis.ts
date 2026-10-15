// POST /workspaces/{ws}/analyses : valide les sources, enregistre l'analyse et lance la tâche de fond (202).
// Aucune dépense avant que tout soit validé : adresses publiques (EC-SRC-01), fichiers vérifiés et ré-encodés
// (TR-SEC-08). Idempotente par l'`Idempotency-Key` de la route ; la tâche l'est par sa clé `analysis:{id}`.
import { AppError } from '@pubeka/contracts';
import { isUuid } from '@pubeka/shared';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import { ANALYSIS_RUN_TASK, type StartAnalysisDeps } from './deps';
import { cleanText } from './read-source';
import { resolvePublicTarget } from './safe-url';
import { verifyUploadedFile } from './source-files';
import { loadAnalysis, loadProfile, toView, type AnalysisView } from './view';

export type AnalysisSourceInput =
  | { type: 'website' | 'app_link' | 'social_post'; url: string }
  | { type: 'image' | 'document'; file_path: string }
  | { type: 'text'; text: string };

export interface StartAnalysisInput {
  page_id?: string | undefined;
  user_intent?: string | undefined;
  sources: AnalysisSourceInput[];
}

/** Point d'accroche des quotas et crédits (S24) : appelé avant tout enregistrement, une erreur l'arrête. */
export type BeforeSpend = (ctx: MemberCtx) => Promise<void>;

export interface StartAnalysisOptions extends StartAnalysisDeps {
  beforeSpend?: BeforeSpend;
}

const MAX_TEXT_CHARS = 5000;

interface PreparedSource {
  type: AnalysisSourceInput['type'];
  url: string | null;
  file_path: string | null;
  extracted_text: string | null;
}

function fieldFailure(path: string, message: string): AppError {
  return new AppError('validation_failed', {
    errors: [{ field: path, code: 'invalid_value', message }],
  });
}

async function prepare(
  ctx: MemberCtx,
  source: AnalysisSourceInput,
  index: number,
  options: StartAnalysisOptions,
): Promise<PreparedSource> {
  switch (source.type) {
    case 'website':
    case 'app_link':
    case 'social_post':
      try {
        // Refus immédiat d'une adresse interne : aucune dépense, aucune connexion (EC-SRC-01).
        await resolvePublicTarget(source.url, options.resolve);
      } catch (error) {
        // Un nom introuvable n'est pas une attaque : la source sera simplement « illisible » à la lecture.
        if (!(error instanceof AppError) || error.code !== 'source_unreadable') throw error;
      }
      return { type: source.type, url: source.url, file_path: null, extracted_text: null };
    case 'image':
    case 'document': {
      const file = await verifyUploadedFile(ctx, source.file_path, {
        purposes: source.type === 'image' ? ['source', 'reference'] : ['source'],
        kind: source.type,
        images: options.images,
      });
      return { type: source.type, url: null, file_path: file.filePath, extracted_text: null };
    }
    case 'text': {
      const text = cleanText(source.text, MAX_TEXT_CHARS);
      if (text === '') throw fieldFailure(`sources.${String(index)}.text`, 'Texte vide');
      return { type: 'text', url: null, file_path: null, extracted_text: text };
    }
  }
}

export async function startAnalysis(
  ctx: MemberCtx,
  input: StartAnalysisInput,
  options: StartAnalysisOptions,
): Promise<AnalysisView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const workspaceId = ctx.workspace.id;
  const newId = options.newId ?? (() => crypto.randomUUID());

  const paths = input.sources.flatMap((s) => ('file_path' in s ? [s.file_path] : []));
  if (new Set(paths).size !== paths.length) {
    throw fieldFailure('sources', 'Un même fichier ne peut pas être envoyé deux fois');
  }

  if (input.page_id !== undefined) {
    if (!isUuid(input.page_id)) throw fieldFailure('page_id', 'UUID attendu');
    const page = await ctx.db
      .from('pages')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('id', input.page_id)
      .maybeSingle();
    if (page.error !== null) throw new AppError('internal_error', { cause: page.error });
    if (page.data === null) throw new AppError('not_found');
  }

  // Toutes les sources sont validées avant la moindre écriture ou dépense.
  const prepared: PreparedSource[] = [];
  for (const [index, source] of input.sources.entries()) {
    prepared.push(await prepare(ctx, source, index, options));
  }
  await options.beforeSpend?.(ctx);

  const analysisId = newId();
  const rows = prepared.map((p) => ({
    id: newId(),
    workspace_id: workspaceId,
    page_id: input.page_id ?? null,
    type: p.type,
    url: p.url,
    file_path: p.file_path,
    extracted_text: p.extracted_text,
    status: 'ok',
  }));
  const sources = await ctx.svc.from('sources').insert(rows);
  if (sources.error !== null) throw new AppError('internal_error', { cause: sources.error });

  const created = await ctx.svc.from('analyses').insert({
    id: analysisId,
    workspace_id: workspaceId,
    page_id: input.page_id ?? null,
    created_by: ctx.user.id,
    status: 'queued',
    user_intent:
      input.user_intent === undefined ? null : cleanText(input.user_intent, 1000) || null,
    source_ids: rows.map((r) => r.id),
  });
  if (created.error !== null) throw new AppError('internal_error', { cause: created.error });

  try {
    await options.jobs.enqueue(
      ANALYSIS_RUN_TASK,
      { analysisId, workspaceId },
      `analysis:${analysisId}`,
    );
  } catch (cause) {
    // La tâche n'a pas démarré : aucune dépense. On le dit au lieu de laisser une analyse « en file » pour toujours.
    await ctx.svc
      .from('analyses')
      .update({ status: 'failed', error_code: 'provider_unavailable' })
      .eq('workspace_id', workspaceId)
      .eq('id', analysisId);
    throw new AppError('provider_unavailable', { cause });
  }

  // Avec le mode `inline` (tests, parcours), la tâche a déjà tourné : on relit l'état pour le rendre fidèle.
  const row = await loadAnalysis(ctx, analysisId);
  return toView(row, await loadProfile(ctx, row));
}
