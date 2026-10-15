// Indicateur des six étapes de l'assistant (APPFLOW §8) : Sources → Questions → Proposition → Visuel → Aperçu → Publier.
// Sur téléphone : « Étape 1 sur 6 » et une barre ; à partir de 640 px : les six noms. L'étape en cours porte
// `aria-current="step"` ; l'état ne repose jamais sur la couleur seule (coche, marque, texte).
import { cn } from '@pubeka/ui';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export const WIZARD_STEPS = [
  'sources',
  'questions',
  'proposal',
  'visual',
  'preview',
  'publish',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function Stepper({ current }: { current: WizardStep }): ReactNode {
  const t = useTranslations('campaign.wizard.steps');
  const index = WIZARD_STEPS.indexOf(current);
  return (
    <nav aria-label={t('label')} className="flex flex-col gap-2">
      <ol className="hidden items-center gap-2 sm:flex">
        {WIZARD_STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === index ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 border-t-2 pt-2 text-xs font-semibold',
              i < index ? 'border-success text-ink' : null,
              i === index ? 'border-ink text-ink' : null,
              i > index ? 'border-line text-muted' : null,
            )}
          >
            {i < index ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{t(step)}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex gap-1.5" aria-hidden="true">
          {WIZARD_STEPS.map((step, i) => (
            <span
              key={step}
              className={cn(
                'h-1 flex-1 rounded-full',
                i < index ? 'bg-success' : i === index ? 'bg-ink' : 'bg-line',
              )}
            />
          ))}
        </div>
        <p className="text-meta text-muted font-semibold">
          {t('progress', { current: index + 1, total: WIZARD_STEPS.length })} · {t(current)}
        </p>
      </div>
    </nav>
  );
}
