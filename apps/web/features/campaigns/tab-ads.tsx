'use client';
// Onglet « Pubs » (APPFLOW §11.3) : chaque publicité et son visuel. La photo est celle de l'étape Sources tant que l'étape Visuel
// (S23) n'existe pas. La publicité gagnante d'un test A/B demandera des statistiques par publicité (pas encore copiées).
import { Card } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCampaignAds } from './api';

export function AdsTab({
  workspaceId,
  campaignId,
}: {
  workspaceId: string;
  campaignId: string;
}): ReactNode {
  const t = useTranslations('campaigns.ads');
  const ads = useCampaignAds(workspaceId, campaignId, true);
  if (ads.data === undefined) {
    return ads.isError ? (
      <p role="alert" className="text-error font-semibold">
        {t('load_failed')}
      </p>
    ) : (
      <p role="status" className="text-meta text-muted">
        {t('loading')}
      </p>
    );
  }
  if (ads.data.data.length === 0) return <p className="text-muted">{t('empty')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {ads.data.ab_test ? <p className="text-meta text-muted">{t('ab_note')}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {ads.data.data.map((ad, index) => (
          <li key={ad.id}>
            <Card className="flex gap-4">
              {ad.photo_url === null ? (
                <div
                  aria-hidden="true"
                  className="border-field-line text-muted flex aspect-[4/5] w-24 shrink-0 items-center justify-center rounded-md border text-xs"
                >
                  {t('no_photo')}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- adresse signée temporaire du stockage, pas une image du site
                <img
                  src={ad.photo_url}
                  alt={t('photo_alt', { number: index + 1 })}
                  className="aspect-[4/5] w-24 shrink-0 rounded-md object-cover"
                />
              )}
              <dl className="flex flex-col gap-1 text-sm">
                <div>
                  <dt className="text-meta text-muted">{t('ad')}</dt>
                  <dd className="font-semibold">
                    {ad.variant === null
                      ? t('ad_number', { number: index + 1 })
                      : t('variant', { variant: ad.variant })}
                  </dd>
                </div>
                {ad.format === null ? null : (
                  <div>
                    <dt className="text-meta text-muted">{t('format')}</dt>
                    <dd className="font-semibold tabular-nums">{ad.format}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
