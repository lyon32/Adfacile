'use client';
// Étape « Questions » (APPFLOW §8.2) : 3 à 5 questions de l'Analyste, une par carte, avec leur « Pourquoi ? » en petit.
// Les réponses déjà données reviennent pré-remplies. Le serveur normalise (téléphone en E.164…) et fait foi : l'écran ne
// fait que prévenir tôt. [Générer la proposition] enregistre les réponses ; la proposition elle-même arrive en S15.
import { Button, Card, cn, Field } from '@pubeka/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { useAnswerQuestions, type Analysis, type Question } from './api';
import { TextAreaField } from './text-area-field';
import { typographic } from './typography';

/** Séparateur des valeurs d'un choix multiple (le même que le serveur). */
export const MULTI_SEPARATOR = '|';
const E164 = /^\+[1-9][0-9]{6,14}$/;
const NUMBER = /^\d+(?:[.,]\d+)?$/;

export type AnswerProblem = 'required' | 'phone' | 'number' | 'invalid';

/** Contrôle de confort d'une réponse (le serveur refait tout). `null` : rien à signaler. */
export function checkAnswer(question: Question, raw: string): AnswerProblem | null {
  const value = raw.trim();
  if (value === '') return question.required ? 'required' : null;
  if (question.input === 'phone') return E164.test(value.replace(/[\s().-]/g, '')) ? null : 'phone';
  if (question.input === 'number') return NUMBER.test(value.replace(/\s/g, '')) ? null : 'number';
  return null;
}

function problemFromServer(error: unknown): Record<string, AnswerProblem> {
  const out: Record<string, AnswerProblem> = {};
  if (!(error instanceof ApiError) || error.code !== 'validation_failed') return out;
  for (const item of error.problem?.errors ?? []) {
    const match = /^answers\.(\d+)\.answer$/.exec(item.field);
    if (match?.[1] !== undefined) out[match[1]] = 'invalid';
  }
  return out;
}

function QuestionInput({
  question,
  value,
  label,
  error,
  onChange,
}: {
  question: Question;
  value: string;
  label: string;
  error: string | undefined;
  onChange: (value: string) => void;
}): ReactNode {
  const t = useTranslations('campaign.wizard.questions');
  const options = question.options ?? [];
  if (question.input === 'single_choice' && options.length > 0) {
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => {
              onChange(option);
            }}
            className={cn(
              'bg-panel flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 text-left text-base',
              value === option ? 'border-ink border-2 font-semibold' : 'border-line',
            )}
          >
            {option}
            {value === option ? <Check aria-hidden="true" className="size-4" /> : null}
          </button>
        ))}
        {error === undefined ? null : (
          <p role="alert" className="text-meta text-error font-semibold">
            {error}
          </p>
        )}
      </div>
    );
  }
  if (question.input === 'multi_choice' && options.length > 0) {
    const chosen = value === '' ? [] : value.split(MULTI_SEPARATOR);
    return (
      <div role="group" aria-label={label} className="flex flex-col gap-2">
        {options.map((option) => {
          const on = chosen.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onChange(
                  (on ? chosen.filter((c) => c !== option) : [...chosen, option]).join(
                    MULTI_SEPARATOR,
                  ),
                );
              }}
              className={cn(
                'bg-panel flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 text-left text-base',
                on ? 'border-ink border-2 font-semibold' : 'border-line',
              )}
            >
              {option}
              {on ? <Check aria-hidden="true" className="size-4" /> : null}
            </button>
          );
        })}
        {error === undefined ? null : (
          <p role="alert" className="text-meta text-error font-semibold">
            {error}
          </p>
        )}
      </div>
    );
  }
  if (question.input === 'text' && value.length > 120) {
    return (
      <TextAreaField
        label={label}
        value={value}
        maxLength={500}
        error={error}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    );
  }
  return (
    <Field
      label={label}
      value={value}
      maxLength={500}
      error={error}
      {...(question.input === 'phone'
        ? {
            type: 'tel',
            inputMode: 'tel' as const,
            autoComplete: 'tel',
            placeholder: '+237 690 12 34 56',
          }
        : question.input === 'number'
          ? { inputMode: 'decimal' as const }
          : {})}
      hint={question.required ? undefined : t('optional')}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

const NOTICE_FLAGS = [
  ['IMAGES_NOT_READ', 'images_not_read'],
  ['IMAGE_VALUES_UNVERIFIED', 'image_values'],
  ['MULTIPLE_BUSINESSES', 'multiple_businesses'],
  ['PRODUCT_NOT_DETECTED', 'product_not_detected'],
] as const;

export interface QuestionsStepProps {
  workspaceId: string;
  analysis: Analysis;
  onBack: () => void;
  /** Réponses enregistrées : passer à l'étape « Proposition ». */
  onContinue?: () => void;
}

export function QuestionsStep({
  workspaceId,
  analysis,
  onBack,
  onContinue,
}: QuestionsStepProps): ReactNode {
  const t = useTranslations('campaign.wizard.questions');
  const locale = useLocale();
  const save = useAnswerQuestions(workspaceId, analysis.id);
  // Brouillon des réponses : initialisé avec celles du serveur, puis modifié par la personne.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(analysis.answers.map((a) => [a.question_id, a.answer])),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [serverProblems, setServerProblems] = useState<Record<string, AnswerProblem>>({});
  const [editing, setEditing] = useState(false);

  const problems = Object.fromEntries(
    analysis.questions.map((q) => [q.id, checkAnswer(q, values[q.id] ?? '')] as const),
  );
  const unreadable = analysis.unreadable_sources.length;
  const saved = analysis.status === 'ready' && !editing;

  function submit(): void {
    setShowErrors(true);
    setServerProblems({});
    if (Object.values(problems).some((p) => p !== null)) return;
    const answers = analysis.questions.flatMap((q) => {
      const answer = (values[q.id] ?? '').trim();
      return answer === '' ? [] : [{ question_id: q.id, answer }];
    });
    if (answers.length === 0) return;
    save.mutate(answers, {
      onSuccess: () => {
        setEditing(false);
      },
      onError: (error) => {
        const byIndex = problemFromServer(error);
        const mapped: Record<string, AnswerProblem> = {};
        for (const [index, problem] of Object.entries(byIndex)) {
          const id = answers[Number(index)]?.question_id;
          if (id !== undefined) mapped[id] = problem;
        }
        setServerProblems(mapped);
      },
    });
  }

  const errorText = (id: string): string | undefined => {
    const problem = serverProblems[id] ?? (showErrors ? problems[id] : null) ?? null;
    if (problem === null) return undefined;
    return t(problem === 'required' ? 'required_error' : `${problem}_error`);
  };

  return (
    <section aria-labelledby="questions-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="questions-title" className="text-2xl font-bold">
          {t('title')}
        </h1>
        <p className="text-muted">{t('body')}</p>
      </header>

      <div className="flex flex-col gap-2" role="status">
        {unreadable > 0 ? (
          <p className="border-line bg-panel text-meta rounded-md border px-4 py-3 font-semibold">
            {t('notices.unreadable', { count: unreadable })}
          </p>
        ) : null}
        {NOTICE_FLAGS.filter(([flag]) => analysis.flags.includes(flag)).map(([flag, key]) => (
          <p
            key={flag}
            className="border-line bg-panel text-meta rounded-md border px-4 py-3 font-semibold"
          >
            {t(`notices.${key}`)}
          </p>
        ))}
      </div>

      {saved ? (
        <Card className="flex flex-col gap-3" role="status">
          <h2 className="text-title flex items-center gap-2 font-semibold">
            <Check aria-hidden="true" className="size-5" />
            {t('saved_title')}
          </h2>
          <p className="text-muted">{t('saved_body')}</p>
          {onContinue === undefined ? null : (
            <Button type="button" className="w-full sm:w-auto sm:self-start" onClick={onContinue}>
              {t('go_proposal')}
            </Button>
          )}
          <Button
            type="button"
            variant="quiet"
            className="self-start"
            onClick={() => {
              setEditing(true);
            }}
          >
            {t('edit')}
          </Button>
        </Card>
      ) : (
        <>
          <ol className="flex flex-col gap-4">
            {analysis.questions.map((question) => (
              <li key={question.id}>
                <Card className="flex flex-col gap-4">
                  <h2 className="text-title font-semibold">{typographic(question.text, locale)}</h2>
                  <QuestionInput
                    question={question}
                    value={values[question.id] ?? ''}
                    label={t('answer_label')}
                    error={errorText(question.id)}
                    onChange={(value) => {
                      setValues((current) => ({ ...current, [question.id]: value }));
                    }}
                  />
                  {question.why === undefined || question.why === '' ? null : (
                    <p className="text-meta text-muted">
                      <span className="font-semibold">{t('why')}</span>{' '}
                      {typographic(question.why, locale)}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3" aria-live="polite">
            {save.isError && Object.keys(serverProblems).length === 0 ? (
              <p role="alert" className="text-error text-sm font-semibold">
                {t('save_failed')}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={save.isPending}
                onClick={submit}
              >
                {save.isPending ? t('saving') : t('submit')}
              </Button>
              <Button type="button" variant="quiet" className="w-full sm:w-auto" onClick={onBack}>
                {t('back')}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
