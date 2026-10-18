// Monnaies : unités mineures (exposant ISO 4217) et conversion dollars -> monnaie locale, en entiers (CONVENTIONS §6.6).
//
// Source des exposants : ISO 4217, liste 1 « Currency, fund and precious metal codes » tenue par SIX (agence de maintenance
// de l'ISO) : https://www.six-group.com/en/products-services/financial-information/data-standards.html. Ce n'est PAS le
// CLDR d'`Intl` : CLDR donne 0 décimale à MGA et SOS là où ISO 4217 en donne 2 (le test les signale). Aucun « 2 par défaut »
// ni « /100 » codé en dur pour une monnaie locale : une monnaie absente de la table lève une erreur.
import { applyRate, usdCents } from './money';

/**
 * Exposant ISO 4217 des monnaies prises en charge : celles des 54 pays d'Afrique, le dollar américain et l'euro (monnaies de compte
 * publicitaire fréquentes, décision du 18/10/2026 ; EUR : code 978, unité mineure 2 d'après la liste 1 de SIX).
 */
const MINOR_UNITS = {
  DZD: 2,
  AOA: 2,
  XOF: 0,
  BWP: 2,
  BIF: 0,
  CVE: 2,
  XAF: 0,
  KMF: 0,
  CDF: 2,
  DJF: 0,
  EGP: 2,
  ERN: 2,
  SZL: 2,
  ETB: 2,
  GMD: 2,
  GHS: 2,
  GNF: 0,
  KES: 2,
  LSL: 2,
  LRD: 2,
  LYD: 3,
  MGA: 2,
  MWK: 2,
  MRU: 2,
  MUR: 2,
  MAD: 2,
  MZN: 2,
  NAD: 2,
  NGN: 2,
  RWF: 0,
  STN: 2,
  SCR: 2,
  SLE: 2,
  SOS: 2,
  ZAR: 2,
  SSP: 2,
  SDG: 2,
  TZS: 2,
  TND: 3,
  UGX: 0,
  ZMW: 2,
  ZWG: 2,
  USD: 2,
  EUR: 2,
} as const satisfies Record<string, 0 | 1 | 2 | 3>;

export type KnownCurrency = keyof typeof MINOR_UNITS;

/**
 * Monnaies hors Afrique que Pubeka sait convertir parce que des comptes publicitaires Meta y sont ouverts (décision du
 * 18/10/2026 : « la plupart en dollars, certains en euros »). Leur taux est rafraîchi avec ceux des pays actifs.
 */
export const AD_ACCOUNT_FX_EXTRAS = ['EUR'] as const;

/** Les 42 monnaies des pays d'Afrique prises en charge (sans le dollar américain ni l'euro). */
export const AFRICAN_CURRENCIES: readonly string[] = Object.keys(MINOR_UNITS).filter(
  (code) => code !== 'USD' && code !== 'EUR',
);

export function isKnownCurrency(code: string): code is KnownCurrency {
  return Object.hasOwn(MINOR_UNITS, code);
}

/** Nombre de décimales de l'unité mineure (0 : FCFA ; 2 : naira ; 3 : dinar tunisien). */
export function minorUnits(code: string): 0 | 1 | 2 | 3 {
  if (!isKnownCurrency(code)) throw new RangeError(`Monnaie non prise en charge : « ${code} »`);
  return MINOR_UNITS[code];
}

const SCALE = 10_000;
// centimes × (taux × 10 000) × 10^exposant ÷ (100 centimes × 10 000)
const DENOMINATOR = SCALE * 100;

/**
 * Convertit des centimes de dollar en unités mineures de la monnaie locale (arrondi au plus proche, 0,5 monte).
 * Le taux (unités de monnaie par dollar) est ramené en entier au dix-millième avant tout calcul : aucun flottant n'entre dans
 * le montant.
 */
export function convertUsdCents(cents: number, rate: number, currency: string): number {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('Les centimes de dollar doivent être un entier positif ou nul');
  }
  if (!Number.isFinite(rate) || rate <= 0)
    throw new RangeError('Le taux doit être positif et fini');
  const scaled = Math.round(rate * SCALE);
  if (scaled <= 0) throw new RangeError('Le taux est trop petit');
  const digits = minorUnits(currency);
  return applyRate(usdCents(cents), scaled * 10 ** digits, DENOMINATOR, 'half_up').amountMinor;
}

/** Texte décimal exact d'un montant en unités mineures : 5250000 NGN -> « 52500.00 » (pas de séparateur, pas de flottant). */
export function formatMinorUnits(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('Le montant doit être un entier');
  const digits = minorUnits(currency);
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor)
    .toString()
    .padStart(digits + 1, '0');
  if (digits === 0) return `${sign}${abs}`;
  return `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
}
