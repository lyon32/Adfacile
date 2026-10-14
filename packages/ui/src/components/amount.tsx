import { cn } from '../lib/cn';

export type UiLocale = 'fr' | 'en';

const INTL_LOCALE: Record<UiLocale, string> = { fr: 'fr-FR', en: 'en-US' };

function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} doit être un entier`);
  }
}

/** « 5 000 FCFA » : séparateur de milliers espace fine en français (DS §3). */
export function formatXaf(amountXaf: number, locale: UiLocale): string {
  assertInteger(amountXaf, 'amountXaf');
  const n = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(
    amountXaf,
  );
  return `${n} FCFA`;
}

/** « ≈ 18,20 $ » (fr) ou « ≈ $18.20 » (en), à partir de centimes entiers. */
export function formatUsdApprox(usdCents: number, locale: UiLocale): string {
  assertInteger(usdCents, 'usdCents');
  const s = new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: 'USD',
  }).format(usdCents / 100);
  return `≈ ${s}`;
}

export interface AmountProps {
  amountXaf: number;
  usdCents?: number;
  locale: UiLocale;
  size?: 'md' | 'lg';
  className?: string;
}

/** Montant : FCFA en grand, dollars en petit dessous, chiffres tabulaires (DS §3). */
export function Amount({ amountXaf, usdCents, locale, size = 'md', className }: AmountProps) {
  return (
    <span className={cn('inline-flex flex-col tabular-nums', className)}>
      <span className={cn('text-ink font-bold', size === 'lg' ? 'text-4xl' : 'text-lg')}>
        {formatXaf(amountXaf, locale)}
      </span>
      {usdCents === undefined ? null : (
        <span className="text-meta text-muted">{formatUsdApprox(usdCents, locale)}</span>
      )}
    </span>
  );
}
