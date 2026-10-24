'use client';
// Page « Campagnes » `/campagnes` : toutes les campagnes de l'espace, avec leur état et leur résultat. Mêmes lignes que le tableau de
// bord. Mise à jour sans recharger (interrogation régulière de la route `overview`).
import { Button, Card } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useOverview } from './api';
import { CampaignRows } from './campaign-rows';
import { FxAttribution } from './money';

export function CampaignsPage({
  workspaceId,
  canCreate,
}: {
  workspaceId: string;
  canCreate: boolean;
}): ReactNode {
  const t = useTranslations('campaigns.list');
  const overview = useOverview(workspaceId, 'week');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
        {canCreate ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/campagnes/nouvelle">{t('new_campaign')}</Link>
          </Button>
        ) : null}
      </div>
      {overview.data === undefined ? (
        overview.isError ? (
          <Card role="alert" className="flex flex-col gap-3">
            <p className="text-error font-semibold">{t('load_failed')}</p>
            <Button
              type="button"
              variant="quiet"
              className="self-start"
              onClick={() => {
                void overview.refetch();
              }}
            >
              {t('retry')}
            </Button>
          </Card>
        ) : (
          <p role="status" className="text-meta text-muted">
            {t('loading')}
          </p>
        )
      ) : overview.data.campaigns.length === 0 ? (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">{t('empty_title')}</p>
          <p className="text-meta text-muted">{t('empty_body')}</p>
        </Card>
      ) : (
        <>
          <CampaignRows campaigns={overview.data.campaigns} />
          <FxAttribution fx={overview.data.fx} />
        </>
      )}
    </div>
  );
}
