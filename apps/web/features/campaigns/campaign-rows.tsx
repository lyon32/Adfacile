'use client';
// Liste des campagnes (tableau de bord et page « Campagnes ») : une ligne par campagne avec son état, son résultat, son dépensé et
// son coût par résultat. Même balisage à toutes les largeurs : la ligne se range en colonnes à partir de 768 px, jamais de
// défilement horizontal. La ligne entière mène à la page de la campagne.
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Overview } from './api';
import { moneyText, useUiLocale } from './money';
import { ResultSentence, StatusPill } from './status';

export function CampaignRows({ campaigns }: { campaigns: Overview['campaigns'] }): ReactNode {
  const t = useTranslations('campaigns.dashboard');
  const locale = useUiLocale();
  return (
    <ul className="flex flex-col gap-3">
      {campaigns.map((campaign) => (
        <li
          key={campaign.id}
          className="border-line bg-panel hover:border-field-line relative grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:items-center md:gap-4"
        >
          <div className="flex min-w-0 flex-col items-start gap-2">
            <Link
              href={`/campagnes/${campaign.id}`}
              className="text-title max-w-full truncate font-semibold after:absolute after:inset-0"
            >
              {campaign.name}
            </Link>
            <StatusPill status={campaign.status} />
          </div>
          <dl className="contents">
            <div className="flex flex-col">
              <dt className="text-meta text-muted">{t('col_results')}</dt>
              <dd className="text-sm font-semibold">
                <ResultSentence
                  count={campaign.results}
                  kind={campaign.result_kind}
                  costPerResult={null}
                />
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-meta text-muted">{t('col_spent')}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {moneyText(campaign.spend, locale)}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-meta text-muted">{t('col_cost')}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {campaign.cost_per_result === null
                  ? t('none')
                  : moneyText(campaign.cost_per_result, locale)}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
