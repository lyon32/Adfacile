'use client';
// Bandeau d'un refus de Meta sur la page de la campagne (APPFLOW §12) : le titre dit ce qui s'est passé, le bouton « Voir pourquoi »
// ouvre le rapport du Modérateur. Un refus PARTIEL d'un test A/B (EC-META-06) le dit et rappelle que la campagne continue.
import { Button, Card } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRejections, type Rejection } from './rejection-api';

function bodyKey(
  rejection: Rejection,
): 'banner_body_partial' | 'banner_body_pending' | 'banner_body_failed' | 'banner_body_ready' {
  if (rejection.partial) return 'banner_body_partial';
  if (rejection.status === 'pending' || rejection.status === 'running')
    return 'banner_body_pending';
  if (rejection.status === 'failed') return 'banner_body_failed';
  return 'banner_body_ready';
}

export function RejectionBanner({
  workspaceId,
  campaignId,
  enabled,
}: {
  workspaceId: string;
  campaignId: string;
  enabled: boolean;
}): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const rejections = useRejections(workspaceId, campaignId, enabled);
  // Les refus déjà corrigés et republiés ne demandent plus rien.
  const open = (rejections.data?.data ?? []).filter((rejection) => !rejection.fixed);
  if (open.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {open.map((rejection) => (
        <li key={rejection.id}>
          <Card
            role="status"
            className="border-error flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold">
                {rejection.variant === null
                  ? t('banner_title')
                  : t('banner_title_partial', { variant: rejection.variant })}
              </p>
              <p className="text-meta text-muted">{t(bodyKey(rejection))}</p>
            </div>
            <Button asChild variant="secondary" className="shrink-0 self-start sm:self-center">
              <Link href={`/campagnes/${campaignId}/refus/${rejection.id}`}>{t('banner_cta')}</Link>
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
