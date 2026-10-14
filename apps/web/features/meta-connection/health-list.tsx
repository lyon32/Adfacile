'use client';
// Bilan de santé (F1, APPFLOW §6.3) : une ligne par élément, un mot et un point de couleur (jamais
// la couleur seule, TR-ACC-03). Chaque ligne à corriger ouvre son guide « Comment faire » dans un
// panneau (plein écran sur téléphone).
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { HealthItem, HealthKey } from './api';

/** Éléments facultatifs : rouge n'est pas bloquant, [Ignorer] est possible (APPFLOW §6.3). */
const OPTIONAL: readonly HealthKey[] = ['instagram', 'pixel'];

type Tone = 'success' | 'error' | 'warn' | 'neutral';

export function toneOf(item: HealthItem): Tone {
  if (item.ok) return 'success';
  if (item.recommended === true) return 'warn';
  return OPTIONAL.includes(item.key) ? 'neutral' : 'error';
}

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warn: 'bg-warn',
  neutral: 'border border-muted bg-transparent',
};

const GUIDE_SLUGS = [
  'business-portfolio',
  'ad-account',
  'payment-method',
  'facebook-page',
  'instagram',
  'whatsapp-business',
  'pixel',
  'permissions',
] as const;
type GuideSlug = (typeof GUIDE_SLUGS)[number];

function guideSlug(value: string | undefined): GuideSlug | null {
  return GUIDE_SLUGS.find((slug) => slug === value) ?? null;
}

function Guide({
  slug,
  onClose,
}: {
  slug: GuideSlug;
  onClose: (open: boolean) => void;
}): ReactNode {
  const t = useTranslations('meta.guides');
  const common = useTranslations('common');
  const steps = [
    t(`${slug}.step_1`),
    t(`${slug}.step_2`),
    t(`${slug}.step_3`),
    t(`${slug}.step_4`),
  ];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        closeLabel={common('close')}
        className="inset-x-0 top-0 right-0 left-auto mx-0 flex h-dvh max-w-none translate-y-0 flex-col gap-4 overflow-y-auto rounded-none border-y-0 border-r-0 p-5 sm:max-w-md sm:p-6"
      >
        <DialogTitle>{t(`${slug}.title`)}</DialogTitle>
        <DialogDescription>{t(`${slug}.intro`)}</DialogDescription>
        <ol className="flex flex-col gap-3">
          {steps.map((text, index) => (
            <li key={text} className="flex gap-3">
              <span
                aria-hidden="true"
                className="bg-ink text-bg text-meta flex size-6 shrink-0 items-center justify-center rounded-full font-bold tabular-nums"
              >
                {index + 1}
              </span>
              <p className="pt-px">{text}</p>
            </li>
          ))}
        </ol>
        <p className="text-meta text-muted">{t(`${slug}.note`)}</p>
        <DialogClose asChild>
          <Button variant="quiet" className="mt-auto w-full sm:w-auto sm:self-start">
            {common('close')}
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function HealthList({ items }: { items: readonly HealthItem[] }): ReactNode {
  const t = useTranslations('meta.health');
  const [guide, setGuide] = useState<GuideSlug | null>(null);
  const [ignored, setIgnored] = useState<ReadonlySet<HealthKey>>(new Set());
  const whatsappMissing = items.some((i) => i.key === 'whatsapp' && !i.ok);

  return (
    <div className="flex flex-col gap-3">
      {whatsappMissing ? (
        <p
          role="note"
          className="border-warn text-meta rounded-md border border-l-4 px-4 py-3 font-semibold"
        >
          {t('whatsapp_banner')}
        </p>
      ) : null}
      <ul className="border-line divide-line divide-y rounded-lg border">
        {items.map((item) => {
          const tone = toneOf(item);
          const isIgnored = ignored.has(item.key);
          const slug = guideSlug(item.guide_slug);
          return (
            <li
              key={item.key}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', DOT[tone])}
                />
                <div className="min-w-0">
                  <p className="font-semibold">{t(`items.${item.key}.label`)}</p>
                  <p className="text-meta text-muted">
                    {item.ok
                      ? t(`items.${item.key}.ok`)
                      : isIgnored
                        ? t('ignored')
                        : t(`items.${item.key}.ko`)}
                  </p>
                </div>
              </div>
              {!item.ok && !isIgnored ? (
                <div className="flex items-center gap-2 pl-5.5 sm:pl-0">
                  {slug === null ? null : (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        setGuide(slug);
                      }}
                    >
                      {t('how')}
                    </Button>
                  )}
                  {OPTIONAL.includes(item.key) ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        setIgnored(new Set([...ignored, item.key]));
                      }}
                    >
                      {t('ignore')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {guide === null ? null : (
        <Guide
          slug={guide}
          onClose={() => {
            setGuide(null);
          }}
        />
      )}
    </div>
  );
}
