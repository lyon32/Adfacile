'use client';
// « À prévoir sur ta carte ou tes fonds Meta » (écran Publier, décision de la personne du 18/10/2026) : le budget plus une marge,
// car Meta ajoute des taxes et des frais variables. Le montant est INDICATIF et calculé par le serveur (budget + marge, arrondi au
// dollar supérieur, en dollars ET dans la monnaie du client) : aucun pourcentage de frais de Meta n'est annoncé ici.
// Une donnée manquante est DITE, jamais remplacée : sans taux de change, le dollar seul (pas de montant local inventé).
import { minorUnits } from '@pubeka/shared';
import { formatLocalMoney, formatUsdApprox, type UiLocale } from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Cost } from './proposal-api';

export function ReservePanel({ cost }: { cost: Cost }): ReactNode {
  const t = useTranslations('campaign.wizard.publish.reserve');
  const locale: UiLocale = useLocale() === 'en' ? 'en' : 'fr';
  const reserve = cost.reserve ?? null;
  if (reserve === null) return null;

  const local = reserve.local ?? null;
  const dollars = formatUsdApprox(reserve.usd_cents, locale);
  const amount =
    local === null
      ? dollars
      : `${formatLocalMoney(local.local_minor, local.currency, minorUnits(local.currency), locale)} · ${dollars}`;

  return (
    <section
      aria-labelledby="reserve-title"
      className="border-line bg-panel flex flex-col gap-2 rounded-lg border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="reserve-title" className="text-title text-lg font-bold">
          {t('title')}
        </h2>
        <span className="border-line text-meta rounded-sm border px-1.5 py-0.5 text-xs font-bold">
          {t('indicative')}
        </span>
      </div>
      <p className="text-title text-xl font-bold tabular-nums">{t('line', { amount })}</p>
      <p className="text-meta text-muted">{t('explain')}</p>
      {local !== null && cost.fx?.source === 'exchangerate-api' ? (
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
