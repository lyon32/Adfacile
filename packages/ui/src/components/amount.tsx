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

/** Texte décimal exact d'un entier en unités mineures : (5250000, 2) -> « 52500.00 » (aucun flottant). */
function decimalText(amountMinor: number, digits: number): `${number}` {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor)
    .toString()
    .padStart(digits + 1, '0');
  // Texte numérique construit ici à partir d'un entier : le type littéral est garanti par construction.
  const text =
    digits === 0 ? `${sign}${abs}` : `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
  return text as `${number}`;
}

/**
 * Montant en monnaie locale à partir d'un entier en UNITÉS MINEURES (exposant ISO 4217 passé par l'appelant : 0 pour le
 * FCFA, 2 pour le naira, 3 pour le dinar tunisien). Le FCFA (XAF, XOF) s'écrit « 5 000 FCFA » ; les autres monnaies
 * suivent `Intl.NumberFormat` avec leur code ISO, sans ambiguïté de symbole.
 */
export function formatLocalMoney(
  amountMinor: number,
  currency: string,
  minorDigits: number,
  locale: UiLocale,
): string {
  assertInteger(amountMinor, 'amountMinor');
  if (!Number.isInteger(minorDigits) || minorDigits < 0 || minorDigits > 3) {
    throw new RangeError('minorDigits doit valoir 0, 1, 2 ou 3');
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError('currency doit être un code ISO 4217');
  const text = decimalText(amountMinor, minorDigits);
  if (currency === 'XAF' || currency === 'XOF') {
    const n = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(text);
    return `${n} FCFA`;
  }
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: minorDigits,
    maximumFractionDigits: minorDigits,
  }).format(text);
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
  /** Montant en unités mineures de `currency` (entier). */
  amountMinor: number;
  /** Code ISO 4217 (XAF, XOF, NGN…). */
  currency: string;
  /** Exposant ISO 4217 de `currency` (0, 2 ou 3). */
  minorDigits: number;
  usdCents?: number;
  locale: UiLocale;
  size?: 'md' | 'lg';
  className?: string;
}

/** Montant : monnaie locale en grand, dollars en petit dessous, chiffres tabulaires (DS §3). */
export function Amount({
  amountMinor,
  currency,
  minorDigits,
  usdCents,
  locale,
  size = 'md',
  className,
}: AmountProps) {
  return (
    <span className={cn('inline-flex flex-col tabular-nums', className)}>
      <span className={cn('text-ink font-bold', size === 'lg' ? 'text-4xl' : 'text-lg')}>
        {formatLocalMoney(amountMinor, currency, minorDigits, locale)}
      </span>
      {usdCents === undefined ? null : (
        <span className="text-meta text-muted">{formatUsdApprox(usdCents, locale)}</span>
      )}
    </span>
  );
}
