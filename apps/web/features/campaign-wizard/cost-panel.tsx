'use client';
// Coût d'une proposition (PRD §9.2) : total en monnaie locale en grand, dollars dessous. Tout vient du serveur.
// TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision : le coût est le budget.
// Une donnée manquante est DITE, jamais remplacée : taux de change indisponible = le dollar seul.
import { minorUnits } from '@pubeka/shared';
import { Amount, formatUsdApprox, type UiLocale } from '@pubeka/ui';
import { Info } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Cost } from './proposal-api';

export function CostPanel({ cost }: { cost: Cost }): ReactNode {
  const t = useTranslations('campaign.wizard.proposal.cost');
  const locale: UiLocale = useLocale() === 'en' ? 'en' : 'fr';
  const days = cost.days ?? 0;
  const total = cost.total ?? null;
  const budget = cost.budget_usd_cents ?? null;

  return (
    <section aria-labelledby="cost-title" className="border-line flex flex-col gap-3 border-t pt-5">
      <h2 id="cost-title" className="tracking-eyebrow text-muted text-xs font-bold uppercase">
        {t('title')}
      </h2>

      {cost.status === 'incomplete' ? <p className="text-muted">{t('incomplete')}</p> : null}

      {cost.status === 'ok' && total !== null ? (
        <>
          <p className="text-meta text-muted">{t('total')}</p>
          <Amount
            amountMinor={total.local_minor}
            currency={total.currency}
            minorDigits={minorUnits(total.currency)}
            usdCents={total.usd_cents}
            locale={locale}
            size="lg"
          />
        </>
      ) : null}

      {cost.status === 'fx_not_available' ? (
        <>
          <p role="status" className="text-meta flex items-start gap-2 font-semibold">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('fx_missing')}
          </p>
          {budget === null ? null : (
            <p className="text-title text-xl font-bold tabular-nums">
              {formatUsdApprox(budget, locale)}
            </p>
          )}
        </>
      ) : null}

      {(cost.status === 'ok' || cost.status === 'fx_not_available') && budget !== null ? (
        <dl className="text-meta text-muted grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>{t('budget', { days })}</dt>
          <dd className="text-ink text-right">{formatUsdApprox(budget, locale)}</dd>
        </dl>
      ) : null}

      {cost.status === 'ok' ? <p className="text-meta text-muted">{t('note')}</p> : null}

      {/* Attribution exigée par ExchangeRate-API (accès ouvert) partout où un montant converti est affiché. */}
      {cost.status === 'ok' && cost.fx?.source === 'exchangerate-api' ? (
        <p className="text-meta text-muted">
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {t('attribution')}
          </a>
        </p>
      ) : null}
    </section>
  );
}
