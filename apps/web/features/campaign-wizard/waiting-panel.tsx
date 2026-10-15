'use client';
// Écran d'attente « Je lis tes sources… » (APPFLOW §8.1) : trois étapes cochées au fil de l'analyse (lecture → compréhension →
// questions). Les changements sont annoncés poliment aux lecteurs d'écran ; aucune animation sauf l'état « en cours ».
import { Card, cn, Eyebrow } from '@pubeka/ui';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { AnalysisStatus } from './api';

const STAGES = ['reading', 'understanding', 'questions'] as const;

/** Étape en cours selon l'état de l'analyse (0 lecture, 1 compréhension, 2 questions). */
export function currentStage(status: AnalysisStatus): number {
  if (status === 'queued' || status === 'reading') return 0;
  if (status === 'analysing') return 1;
  return 2;
}

export function WaitingPanel({ status }: { status: AnalysisStatus }): ReactNode {
  const t = useTranslations('campaign.wizard.waiting');
  const current = currentStage(status);
  return (
    <Card className="flex flex-col gap-5" aria-busy="true">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t('label')}</Eyebrow>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted">{t('body')}</p>
      </header>
      <ol aria-label={t('label')} aria-live="polite" className="flex flex-col gap-3">
        {STAGES.map((stage, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <li
              key={stage}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 text-base',
                state === 'todo' ? 'text-muted' : 'text-ink font-semibold',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border',
                  state === 'done' ? 'border-success bg-success' : 'border-field-line',
                  state === 'current' ? 'border-ink border-2' : null,
                )}
              >
                {state === 'done' ? <Check className="text-on-accent size-4" /> : null}
                {state === 'current' ? (
                  <span className="bg-ink size-2 rounded-full motion-safe:animate-pulse" />
                ) : null}
              </span>
              <span>{t(stage)}</span>
              <span className="sr-only">{t(state)}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
