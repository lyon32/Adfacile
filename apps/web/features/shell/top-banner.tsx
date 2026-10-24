'use client';
// Bandeau du haut (APPFLOW §2.1, PRD §10.1) : trois informations au plus quand le compte a de l'activité, sinon un appel à l'action.
// S17 : « Campagnes actives » et « Dépensé ce mois » (monnaie locale, dollars dessous) viennent de la route `overview` et se mettent à
// jour sans recharger. « Crédits restants » arrive avec la facturation (S24). Tant que les chiffres chargent, ou si leur lecture
// échoue, le bandeau ne bloque rien : l'appel à l'action s'affiche (jamais un faux zéro).
import { Button } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useOverview } from '../campaigns/api';
import { FxAttribution, MoneyStack } from '../campaigns/money';
import { useSession } from './session-context';

export function TopBanner(): ReactNode {
  const t = useTranslations('shell.banner');
  const session = useSession();
  const overview = useOverview(session.workspace?.id ?? null, 'week');
  const data = overview.data;
  const hasActivity = data?.campaigns.some((c) => c.status !== 'draft') === true;

  if (data !== undefined && hasActivity) {
    return (
      <section
        aria-labelledby="top-banner-title"
        className="border-line bg-panel mb-6 flex flex-col gap-4 rounded-lg border p-4 sm:p-5"
      >
        <h2 id="top-banner-title" className="sr-only">
          {t('stats_title')}
        </h2>
        <dl className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-meta text-muted">{t('active_campaigns')}</dt>
            <dd className="text-3xl font-bold tabular-nums">{data.counts.active}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-meta text-muted">{t('spent_month')}</dt>
            <dd>
              <MoneyStack money={data.spent_month} large />
            </dd>
          </div>
        </dl>
        <FxAttribution fx={data.fx} />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="top-banner-title"
      className="border-line bg-panel mb-6 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div>
        <h2 id="top-banner-title" className="text-title font-bold">
          {t('empty_title')}
        </h2>
        <p className="text-meta text-muted mt-1">{t('empty_body')}</p>
      </div>
      <Button asChild className="w-full sm:w-auto">
        <Link href="/campagnes/nouvelle">{t('empty_cta')}</Link>
      </Button>
    </section>
  );
}
