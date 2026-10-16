'use client';
// Coût d'une proposition (PRD §9.2) : total FCFA en grand, dollars dessous, budget et TVA du pays. Tout vient du serveur.
// Une donnée manquante est DITE, jamais remplacée : « TVA non configurée » quand l'administration n'a pas encore saisi la TVA du pays.
import { Amount, formatUsdApprox, type UiLocale } from '@pubeka/ui';
import { Info } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Cost } from './proposal-api';

function percent(rate: number, locale: UiLocale): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(rate);
}

export function CostPanel({ cost }: { cost: Cost }): ReactNode {
  const t = useTranslations('campaign.wizard.proposal.cost');
  const locale: UiLocale = useLocale() === 'en' ? 'en' : 'fr';
  const days = cost.days ?? 0;
  const total = cost.total ?? null;
  const budget = cost.budget_usd_cents ?? null;
  const vatUsd = cost.vat_usd_cents ?? null;
  const vatRate = cost.vat_rate ?? null;
  const totalUsd = cost.total_usd_cents ?? null;

  return (
    <section aria-labelledby="cost-title" className="border-line flex flex-col gap-3 border-t pt-5">
      <h3 id="cost-title" className="tracking-eyebrow text-muted text-xs font-bold uppercase">
        {t('title')}
      </h3>

      {cost.status === 'incomplete' ? <p className="text-muted">{t('incomplete')}</p> : null}

      {cost.status === 'ok' && total !== null ? (
        <>
          <p className="text-meta text-muted">{t('total')}</p>
          <Amount amountXaf={total.xaf} usdCents={total.usd_cents} locale={locale} size="lg" />
        </>
      ) : null}

      {cost.status === 'fx_not_available' ? (
        <>
          <p role="status" className="text-meta flex items-start gap-2 font-semibold">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('fx_missing')}
          </p>
          {totalUsd === null ? null : (
            <p className="text-title text-xl font-bold tabular-nums">
              {formatUsdApprox(totalUsd, locale)}
            </p>
          )}
        </>
      ) : null}

      {cost.status === 'vat_not_configured' ? (
        <div role="status" className="border-line bg-bg flex flex-col gap-2 rounded-md border p-4">
          <p className="flex items-start gap-2 font-semibold">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('vat_missing_title')}
          </p>
          <p className="text-meta text-muted">{t('vat_missing_body')}</p>
          {budget === null ? null : (
            <p className="text-meta tabular-nums">
              <span className="text-muted">{t('budget_only')} : </span>
              <span className="font-semibold">{formatUsdApprox(budget, locale)}</span>
            </p>
          )}
        </div>
      ) : null}

      {cost.status === 'ok' || cost.status === 'fx_not_available' ? (
        <dl className="text-meta text-muted grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          {budget === null ? null : (
            <>
              <dt>{t('budget', { days })}</dt>
              <dd className="text-ink text-right">{formatUsdApprox(budget, locale)}</dd>
            </>
          )}
          {vatUsd === null || vatRate === null ? null : (
            <>
              <dt>
                {t('vat', {
                  rate: percent(vatRate, locale),
                  country: cost.vat_country ?? '',
                })}
              </dt>
              <dd className="text-ink text-right">{formatUsdApprox(vatUsd, locale)}</dd>
            </>
          )}
        </dl>
      ) : null}

      {cost.status === 'ok' ? <p className="text-meta text-muted">{t('note')}</p> : null}
    </section>
  );
}
