'use client';
// Montants des statistiques (PRD §10) : monnaie locale en grand et dollars dessous quand un taux de moins de 48 h existe,
// sinon le dollar seul (jamais un taux inventé ni périmé). TVA retirée : aucun calcul ni affichage de TVA.
// Attribution obligatoire d'ExchangeRate-API sous tout montant converti.
import { minorUnits } from '@pubeka/shared';
import { formatLocalMoney, formatUsdApprox, type UiLocale } from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { StatsFx, StatsMoney } from './api';

export function useUiLocale(): UiLocale {
  return useLocale() === 'en' ? 'en' : 'fr';
}

/** Texte du montant : monnaie locale si disponible, sinon dollars (« ≈ 60,00 $ »). */
export function moneyText(money: StatsMoney, locale: UiLocale): string {
  if (money.local_minor !== null && money.currency !== null) {
    return formatLocalMoney(money.local_minor, money.currency, minorUnits(money.currency), locale);
  }
  return formatUsdApprox(money.usd_cents, locale);
}

/** Montant sur deux lignes : monnaie locale en grand, dollars en petit dessous (DS §3). */
export function MoneyStack({
  money,
  large = false,
}: {
  money: StatsMoney;
  large?: boolean;
}): ReactNode {
  const locale = useUiLocale();
  const hasLocal = money.local_minor !== null && money.currency !== null;
  return (
    <span className="inline-flex flex-col tabular-nums">
      <span className={large ? 'text-ink text-3xl font-bold sm:text-4xl' : 'text-ink font-bold'}>
        {moneyText(money, locale)}
      </span>
      {hasLocal ? (
        <span className="text-meta text-muted">{formatUsdApprox(money.usd_cents, locale)}</span>
      ) : null}
    </span>
  );
}

/** Lien d'attribution exigé par ExchangeRate-API sous tout montant converti en monnaie locale. */
export function FxAttributionLink(): ReactNode {
  const t = useTranslations('campaigns.fx');
  return (
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
  );
}

/**
 * Attribution sous les montants d'un écran : affichée dès qu'un montant est converti (`fx.status === 'ok'`), QUELLE QUE SOIT la source
 * du taux ; sans taux frais, on dit que le dollar est seul.
 */
export function FxAttribution({ fx }: { fx: StatsFx }): ReactNode {
  const t = useTranslations('campaigns.fx');
  if (fx.status === 'ok') return <FxAttributionLink />;
  return (
    <p role="status" className="text-meta text-muted">
      {t('unavailable')}
    </p>
  );
}
