// POST /workspaces/{ws}/analyses/{id}/answers : enregistre les réponses aux 3 à 5 questions de l'Analyste
// (SECURITY_NOTES §3.2 : ≤ 500 caractères, identifiant de question existant dans CETTE analyse). Aucun appel IA ici :
// la fiche et les réponses servent ensuite au Stratège (S15). L'analyse passe à `ready` quand chaque question
// obligatoire a sa réponse.
import { AppError, type FieldError } from '@pubeka/contracts';
import type { Json } from '@pubeka/db';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import { cleanText } from './read-source';
import { loadAnalysis, loadProfile, toView, type AnalysisView } from './view';

export interface AnswerInput {
  question_id: string;
  answer: string;
}

interface StoredQuestion {
  id: string;
  input: string;
  options: string[] | null;
  required: boolean;
}

interface StoredAnswer {
  question_id: string;
  answer: string;
}

export const MAX_ANSWER_CHARS = 500;
const E164 = /^\+[1-9][0-9]{6,14}$/;
const NUMBER = /^\d+(?:[.,]\d+)?$/;
/** Séparateur des valeurs d'un choix multiple (les options peuvent contenir des virgules). */
export const MULTI_CHOICE_SEPARATOR = '|';

function isQuestion(value: unknown): value is StoredQuestion {
  if (typeof value !== 'object' || value === null) return false;
  const q = value as Record<string, unknown>;
  return typeof q.id === 'string' && typeof q.input === 'string' && typeof q.required === 'boolean';
}

function isAnswer(value: unknown): value is StoredAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return typeof a.question_id === 'string' && typeof a.answer === 'string';
}

/** Rend la réponse normalisée selon le type de la question, ou le motif du refus. */
export function normalizeAnswer(
  question: StoredQuestion,
  raw: string,
): string | { error: FieldError['code'] } {
  const text = cleanText(raw, MAX_ANSWER_CHARS);
  if (text === '') return { error: 'required' };
  switch (question.input) {
    case 'phone': {
      const compact = text.replace(/[\s().-]/g, '');
      return E164.test(compact) ? compact : { error: 'invalid_format' };
    }
    case 'number':
      return NUMBER.test(text.replace(/\s/g, ''))
        ? text.replace(/\s/g, '').replace(',', '.')
        : { error: 'invalid_format' };
    case 'single_choice':
      return question.options === null || question.options.includes(text)
        ? text
        : { error: 'invalid_value' };
    case 'multi_choice': {
      const values = text
        .split(MULTI_CHOICE_SEPARATOR)
        .map((v) => v.trim())
        .filter((v) => v !== '');
      const options = question.options;
      if (values.length === 0 || (options !== null && !values.every((v) => options.includes(v)))) {
        return { error: 'invalid_value' };
      }
      return [...new Set(values)].join(MULTI_CHOICE_SEPARATOR);
    }
    default:
      return text;
  }
}

export async function answerQuestions(
  ctx: MemberCtx,
  analysisId: string,
  answers: readonly AnswerInput[],
): Promise<AnalysisView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const workspaceId = ctx.workspace.id;

  const row = await loadAnalysis(ctx, analysisId);
  if (row.status !== 'questions' && row.status !== 'ready') {
    throw new AppError('conflict', { meta: { reason: 'analysis_not_waiting_for_answers' } });
  }
  const profile = await loadProfile(ctx, row);
  if (profile === null || row.business_profile_id === null) throw new AppError('conflict');

  const questions = (Array.isArray(profile.questions) ? profile.questions : []).filter(isQuestion);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const stored = new Map(
    (Array.isArray(profile.answers) ? profile.answers : [])
      .filter(isAnswer)
      .map((a) => [a.question_id, a.answer]),
  );

  const errors: FieldError[] = [];
  const seen = new Set<string>();
  const accepted = new Map<string, string>();
  for (const [index, item] of answers.entries()) {
    const field = `answers.${String(index)}`;
    const question = byId.get(item.question_id);
    if (question === undefined) {
      errors.push({
        field: `${field}.question_id`,
        code: 'invalid_value',
        message: 'Question inconnue pour cette analyse.',
      });
      continue;
    }
    if (seen.has(item.question_id)) {
      errors.push({
        field: `${field}.question_id`,
        code: 'invalid_value',
        message: 'Question déjà répondue dans cette demande.',
      });
      continue;
    }
    seen.add(item.question_id);
    const normalized = normalizeAnswer(question, item.answer);
    if (typeof normalized !== 'string') {
      // Une réponse vide à une question facultative n'est tout simplement pas enregistrée.
      if (normalized.error === 'required' && !question.required) {
        stored.delete(item.question_id);
        continue;
      }
      errors.push({
        field: `${field}.answer`,
        code: normalized.error,
        message: 'Réponse invalide.',
      });
      continue;
    }
    accepted.set(item.question_id, normalized);
  }
  if (errors.length > 0) throw new AppError('validation_failed', { errors });

  for (const [id, answer] of accepted) stored.set(id, answer);
  const merged: StoredAnswer[] = questions.flatMap((q) => {
    const answer = stored.get(q.id);
    return answer === undefined ? [] : [{ question_id: q.id, answer }];
  });
  const complete = questions.filter((q) => q.required).every((q) => stored.has(q.id));

  const saved = await ctx.svc
    .from('business_profiles')
    .update({ answers: merged as unknown as NonNullable<Json> })
    .eq('workspace_id', workspaceId)
    .eq('id', row.business_profile_id);
  if (saved.error !== null) throw new AppError('internal_error', { cause: saved.error });
  const status = complete ? 'ready' : 'questions';
  const moved = await ctx.svc
    .from('analyses')
    .update({ status })
    .eq('workspace_id', workspaceId)
    .eq('id', analysisId);
  if (moved.error !== null) throw new AppError('internal_error', { cause: moved.error });

  const updated = await loadAnalysis(ctx, analysisId);
  return toView(updated, await loadProfile(ctx, updated));
}
