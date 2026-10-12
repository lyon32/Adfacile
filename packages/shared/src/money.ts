// Argent en entiers uniquement (CONVENTIONS §6.6) : FCFA sans subdivision, dollars en centimes.
export const CURRENCIES = ['XAF', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Montant dans la plus petite unité de la devise : FCFA pour `XAF`, centimes pour `USD`. */
export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} doit être un entier sûr (reçu : ${String(value)})`);
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Devises différentes : ${a.currency} et ${b.currency}`);
  }
}

export function createMoney(amountMinor: number, currency: Currency): Money {
  assertInteger(amountMinor, 'Le montant');
  return { amountMinor, currency };
}

export function xaf(amountXaf: number): Money {
  return createMoney(amountXaf, 'XAF');
}

export function usdCents(amountUsdCents: number): Money {
  return createMoney(amountUsdCents, 'USD');
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinor - b.amountMinor, a.currency);
}

/** Multiplie par un entier (quantité). Pour un taux, voir `applyRate`. */
export function multiplyMoney(m: Money, factor: number): Money {
  assertInteger(factor, 'Le facteur');
  return createMoney(m.amountMinor * factor, m.currency);
}

export type Rounding = 'up' | 'down' | 'half_up';

/**
 * Applique un taux exprimé en fraction entière `numerator / denominator`, sans flottant
 * dans le calcul, avec un arrondi explicite. Ex. 85 % : `applyRate(m, 85, 100, 'up')`.
 * `up` et `down` arrondissent vers +∞ et −∞ ; `half_up` arrondit au plus proche (0,5 → loin de 0).
 */
export function applyRate(
  m: Money,
  numerator: number,
  denominator: number,
  rounding: Rounding,
): Money {
  assertInteger(numerator, 'Le numérateur');
  assertInteger(denominator, 'Le dénominateur');
  if (denominator <= 0) throw new RangeError('Le dénominateur doit être positif');
  const product = BigInt(m.amountMinor) * BigInt(numerator);
  const d = BigInt(denominator);
  let q = product / d;
  const r = product % d;
  if (r !== 0n) {
    const isPositive = product > 0n;
    if (rounding === 'up' && isPositive) q += 1n;
    if (rounding === 'down' && !isPositive) q -= 1n;
    if (rounding === 'half_up' && (r < 0n ? -r : r) * 2n >= d) q += isPositive ? 1n : -1n;
  }
  return createMoney(Number(q), m.currency);
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor === b.amountMinor) return 0;
  return a.amountMinor < b.amountMinor ? -1 : 1;
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}
