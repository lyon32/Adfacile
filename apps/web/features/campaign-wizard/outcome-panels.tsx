'use client';
// Fins d'analyse qui ne mènent pas aux questions : produit refusé (APPFLOW §8.1, EC-SRC-06) et analyse échouée.
// Pour un produit illégal : l'explication, aucun contournement proposé, une contestation possible par le support.
import { Button, buttonVariants, Card, cn } from '@pubeka/ui';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Analysis } from './api';

export type FailureKey =
  'source_unreadable' | 'unsafe_url' | 'model_without_vision' | 'rate_limited' | 'generic';

/** Message d'une analyse échouée, d'après son code (liste fermée d'API_SPEC §4) et ses signalements. */
export function failureKey(analysis: Pick<Analysis, 'error_code' | 'flags'>): FailureKey {
  if (analysis.error_code === 'source_unreadable') return 'source_unreadable';
  if (analysis.error_code === 'unsafe_url') return 'unsafe_url';
  if (analysis.error_code === 'rate_limited') return 'rate_limited';
  if (
    analysis.error_code === 'provider_unavailable' &&
    analysis.flags.includes('MODEL_WITHOUT_VISION')
  ) {
    return 'model_without_vision';
  }
  return 'generic';
}

export function BlockedPanel(): ReactNode {
  const t = useTranslations('campaign.wizard.blocked');
  return (
    <Card className="flex flex-col gap-4" role="alert">
      <h1 className="text-title flex items-start gap-2 text-xl font-bold">
        <AlertTriangle aria-hidden="true" className="text-error mt-1 size-5 shrink-0" />
        {t('title')}
      </h1>
      <p>{t('body')}</p>
      <p className="text-muted">
        {t('contest')}{' '}
        <Link
          href="/support"
          className={cn(buttonVariants({ variant: 'quiet', size: 'sm' }), 'ml-1')}
        >
          {t('contest_link')}
        </Link>
      </p>
    </Card>
  );
}

export function FailedPanel({
  analysis,
  onBack,
}: {
  analysis: Pick<Analysis, 'error_code' | 'flags'>;
  onBack: () => void;
}): ReactNode {
  const t = useTranslations('campaign.wizard.failed');
  return (
    <Card className="flex flex-col gap-4" role="alert">
      <h1 className="text-title flex items-start gap-2 text-xl font-bold">
        <AlertTriangle aria-hidden="true" className="text-error mt-1 size-5 shrink-0" />
        {t('title')}
      </h1>
      <p>{t(failureKey(analysis))}</p>
      <Button type="button" className="w-full sm:w-auto sm:self-start" onClick={onBack}>
        {t('retry')}
      </Button>
    </Card>
  );
}
