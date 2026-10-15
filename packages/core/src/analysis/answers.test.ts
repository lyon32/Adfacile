// Réponses aux questions de l'Analyste (SECURITY_NOTES §3.2) : normalisation par type, identifiants, rôle, état.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { answerQuestions, MULTI_CHOICE_SEPARATOR, normalizeAnswer } from './answers';
import { memberCtx, question, WS } from './fixtures.test-helper';
import { MemoryDb } from './memory-db.test-helper';
import { getAnalysis, toView } from './view';

const ANALYSIS_ID = '66666666-6666-4666-8666-666666666666';
const PROFILE_ID = '77777777-7777-4777-8777-777777777777';

const QUESTIONS = [
  question('q1', 'contacts.whatsapp', 'phone'),
  question('q2', 'locations[0].area', 'location'),
  question('q3', 'products[0].price', 'number', false),
  question('q4', 'tone', 'single_choice', false, ['bold', 'friendly']),
  question('q5', 'promotions', 'multi_choice', false, ['livraison', 'remise', 'cadeau']),
];

function setup(status = 'questions', answers: unknown[] = []) {
  const db = new MemoryDb();
  db.rows('analyses').push({
    id: ANALYSIS_ID,
    workspace_id: WS,
    status,
    blocked_reason: null,
    error_code: null,
    business_profile_id: PROFILE_ID,
    unreadable_sources: [],
    page_id: null,
    user_intent: null,
    source_ids: [],
    created_by: null,
    flags: [],
  });
  db.rows('business_profiles').push({
    id: PROFILE_ID,
    workspace_id: WS,
    profile: { sector: 'x' },
    questions: QUESTIONS,
    answers,
  });
  return db;
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : 'autre';
  }
}
const fields = async (promise: Promise<unknown>): Promise<string[]> => {
  try {
    await promise;
    return [];
  } catch (error) {
    return error instanceof AppError
      ? (error.opts.errors ?? []).map((e) => `${e.field}:${e.code}`)
      : [];
  }
};

describe('normalizeAnswer', () => {
  const q = (input: string, options: string[] | null = null) => ({
    id: 'q',
    input,
    options,
    required: true,
  });

  it('téléphone : normalisé en E.164 (espaces, points, tirets, parenthèses retirés), sinon invalid_format', () => {
    expect(normalizeAnswer(q('phone'), '+237 690-12.34 (56)')).toBe('+237690123456');
    expect(normalizeAnswer(q('phone'), '0690123456')).toEqual({ error: 'invalid_format' });
    expect(normalizeAnswer(q('phone'), '+0123456789')).toEqual({ error: 'invalid_format' });
    expect(normalizeAnswer(q('phone'), '+1234')).toEqual({ error: 'invalid_format' });
  });

  it('nombre : chiffres seulement, virgule décimale acceptée', () => {
    expect(normalizeAnswer(q('number'), '25 000')).toBe('25000');
    expect(normalizeAnswer(q('number'), '12,5')).toBe('12.5');
    expect(normalizeAnswer(q('number'), 'vingt')).toEqual({ error: 'invalid_format' });
    expect(normalizeAnswer(q('number'), '-5')).toEqual({ error: 'invalid_format' });
  });

  it('choix : la valeur doit être une option ; choix multiple : sous-ensemble, sans doublon', () => {
    expect(normalizeAnswer(q('single_choice', ['a', 'b']), 'a')).toBe('a');
    expect(normalizeAnswer(q('single_choice', ['a', 'b']), 'c')).toEqual({
      error: 'invalid_value',
    });
    expect(normalizeAnswer(q('single_choice'), 'libre')).toBe('libre');
    expect(
      normalizeAnswer(
        q('multi_choice', ['a', 'b', 'c']),
        `a ${MULTI_CHOICE_SEPARATOR} c ${MULTI_CHOICE_SEPARATOR} a`,
      ),
    ).toBe('a|c');
    expect(normalizeAnswer(q('multi_choice', ['a', 'b']), 'a|z')).toEqual({
      error: 'invalid_value',
    });
    expect(normalizeAnswer(q('multi_choice', ['a']), '||')).toEqual({ error: 'invalid_value' });
    expect(normalizeAnswer(q('multi_choice'), 'x|y')).toBe('x|y');
  });

  it('texte et lieu : nettoyés, bornés à 500 caractères ; vide → required', () => {
    expect(normalizeAnswer(q('text'), '  Abidjan\u0000 ')).toBe('Abidjan');
    const long = normalizeAnswer(q('location'), 'a'.repeat(900));
    expect(typeof long === 'string' ? long.length : -1).toBe(500);
    expect(normalizeAnswer(q('text'), '   ')).toEqual({ error: 'required' });
  });
});

describe('answerQuestions', () => {
  it('enregistre, normalise et passe à « ready » quand toutes les questions obligatoires ont leur réponse', async () => {
    const db = setup();
    const partial = await answerQuestions(memberCtx(db), ANALYSIS_ID, [
      { question_id: 'q1', answer: '+237 690 12 34 56' },
    ]);
    expect(partial.status).toBe('questions');
    const done = await answerQuestions(memberCtx(db, 'editor'), ANALYSIS_ID, [
      { question_id: 'q2', answer: 'Douala' },
      { question_id: 'q3', answer: '25 000' },
    ]);
    expect(done.status).toBe('ready');
    expect(done.answers).toEqual([
      { question_id: 'q1', answer: '+237690123456' },
      { question_id: 'q2', answer: 'Douala' },
      { question_id: 'q3', answer: '25000' },
    ]);
    expect(db.rows('analyses')[0]?.status).toBe('ready');
  });

  it('une réponse corrigée remplace la précédente ; une réponse vide à une question facultative l’efface', async () => {
    const db = setup('ready', [
      { question_id: 'q1', answer: '+237690123456' },
      { question_id: 'q2', answer: 'Douala' },
      { question_id: 'q3', answer: '100' },
    ]);
    const view = await answerQuestions(memberCtx(db), ANALYSIS_ID, [
      { question_id: 'q2', answer: 'Yaoundé' },
      { question_id: 'q3', answer: '  ' },
    ]);
    expect(view.answers).toEqual([
      { question_id: 'q1', answer: '+237690123456' },
      { question_id: 'q2', answer: 'Yaoundé' },
    ]);
    expect(view.status).toBe('ready');
  });

  it('une réponse vide à une question obligatoire est refusée (required)', async () => {
    const db = setup();
    expect(
      await fields(
        answerQuestions(memberCtx(db), ANALYSIS_ID, [{ question_id: 'q2', answer: ' ' }]),
      ),
    ).toEqual(['answers.0.answer:required']);
  });

  it('un identifiant inconnu de CETTE analyse, un doublon et un format invalide sont refusés (400), rien n’est enregistré', async () => {
    const db = setup();
    expect(
      await fields(
        answerQuestions(memberCtx(db), ANALYSIS_ID, [
          { question_id: 'q9', answer: 'x' },
          { question_id: 'q1', answer: '12345' },
          { question_id: 'q2', answer: 'a' },
          { question_id: 'q2', answer: 'b' },
        ]),
      ),
    ).toEqual([
      'answers.0.question_id:invalid_value',
      'answers.1.answer:invalid_format',
      'answers.3.question_id:invalid_value',
    ]);
    expect(db.rows('business_profiles')[0]?.answers).toEqual([]);
  });

  it('un lecteur ne peut pas répondre ; un espace en lecture seule non plus', async () => {
    const db = setup();
    expect(
      await code(
        answerQuestions(memberCtx(db, 'viewer'), ANALYSIS_ID, [
          { question_id: 'q1', answer: '+237690123456' },
        ]),
      ),
    ).toBe('role_insufficient');
    expect(
      await code(
        answerQuestions(memberCtx(db, 'owner', 'read_only'), ANALYSIS_ID, [
          { question_id: 'q1', answer: '+237690123456' },
        ]),
      ),
    ).toBe('workspace_read_only');
  });

  it('une analyse inconnue ou d’un autre espace : 404 ; qui n’attend pas de réponses : 409', async () => {
    const db = setup();
    expect(
      await code(
        answerQuestions(memberCtx(db), '88888888-8888-4888-8888-888888888888', [
          { question_id: 'q1', answer: 'x' },
        ]),
      ),
    ).toBe('not_found');
    for (const status of ['queued', 'reading', 'analysing', 'failed', 'blocked']) {
      const other = setup(status);
      expect(
        await code(
          answerQuestions(memberCtx(other), ANALYSIS_ID, [
            { question_id: 'q1', answer: '+237690123456' },
          ]),
        ),
      ).toBe('conflict');
    }
  });

  it('une analyse sans fiche enregistrée donne 409', async () => {
    const db = setup();
    db.rows('business_profiles').length = 0;
    expect(
      await code(
        answerQuestions(memberCtx(db), ANALYSIS_ID, [
          { question_id: 'q1', answer: '+237690123456' },
        ]),
      ),
    ).toBe('conflict');
  });

  it('une erreur d’écriture en base est une erreur interne', async () => {
    for (const target of ['business_profiles:update', 'analyses:update']) {
      const db = setup();
      db.failNext.add(target);
      expect(
        await code(
          answerQuestions(memberCtx(db), ANALYSIS_ID, [
            { question_id: 'q1', answer: '+237690123456' },
          ]),
        ),
      ).toBe('internal_error');
    }
  });
});

describe('getAnalysis / toView', () => {
  it('rend l’état, la fiche, les questions et les réponses', async () => {
    const db = setup('questions', [{ question_id: 'q1', answer: '+237690123456' }]);
    const view = await getAnalysis(memberCtx(db), ANALYSIS_ID);
    expect(view).toMatchObject({
      id: ANALYSIS_ID,
      status: 'questions',
      blocked_reason: null,
      error_code: null,
    });
    expect(view.questions).toHaveLength(5);
    expect(view.profile).toEqual({ sector: 'x' });
  });

  it('autre espace ou identifiant inconnu : 404 ; erreur de lecture : erreur interne', async () => {
    const db = setup();
    expect(
      await code(
        getAnalysis(
          {
            ...memberCtx(db),
            workspace: {
              id: '55555555-5555-4555-8555-555555555555',
              role: 'owner',
              access: 'active',
            },
          },
          ANALYSIS_ID,
        ),
      ),
    ).toBe('not_found');
    db.failNext.add('analyses:select');
    expect(await code(getAnalysis(memberCtx(db), ANALYSIS_ID))).toBe('internal_error');
    const other = setup();
    other.failNext.add('business_profiles:select');
    expect(await code(getAnalysis(memberCtx(other), ANALYSIS_ID))).toBe('internal_error');
  });

  it('un produit refusé n’expose ni fiche ni questions, seulement le motif', () => {
    const view = toView(
      {
        id: 'a',
        status: 'blocked',
        blocked_reason: 'illegal_product',
        error_code: null,
        business_profile_id: 'p',
        unreadable_sources: [],
        page_id: null,
        user_intent: null,
        source_ids: [],
        created_by: null,
        flags: ['ILLEGAL_PRODUCT'],
      },
      { profile: { secret: 1 }, questions: QUESTIONS, answers: [] },
    );
    expect(view).toMatchObject({
      status: 'blocked',
      blocked_reason: 'illegal_product',
      profile: null,
      questions: [],
    });
    expect(view.flags).toEqual([]);
  });

  it('seuls les signalements affichables sortent ; les sources illisibles deviennent SOURCE_UNREADABLE:{index}', () => {
    const view = toView(
      {
        id: 'a',
        status: 'questions',
        blocked_reason: null,
        error_code: null,
        business_profile_id: null,
        unreadable_sources: [0, 2],
        page_id: null,
        user_intent: null,
        source_ids: [],
        created_by: null,
        flags: [
          'PROMPT_INJECTION_SUSPECTED',
          'UNGROUNDED_VALUE_REMOVED',
          'IMAGES_NOT_READ',
          'MODEL_WITHOUT_VISION',
        ],
      },
      null,
    );
    expect(view.flags).toEqual([
      'IMAGES_NOT_READ',
      'MODEL_WITHOUT_VISION',
      'SOURCE_UNREADABLE:0',
      'SOURCE_UNREADABLE:2',
    ]);
    expect(view.profile).toBeNull();
    expect(view.questions).toEqual([]);
  });

  it('un statut inconnu en base est une erreur interne (jamais une valeur inventée)', () => {
    expect(() =>
      toView(
        {
          id: 'a',
          status: 'bizarre',
          blocked_reason: null,
          error_code: null,
          business_profile_id: null,
          unreadable_sources: [],
          page_id: null,
          user_intent: null,
          source_ids: [],
          created_by: null,
          flags: [],
        },
        null,
      ),
    ).toThrow(AppError);
  });
});
