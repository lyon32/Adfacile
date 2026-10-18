// Monnaie du compte publicitaire Meta (S16, EC-META-11).
//
// Meta exprime les budgets dans la MONNAIE DU COMPTE PUBLICITAIRE et dans son unité mineure, pas toujours en dollars : un
// compte peut être en naira, en shilling kényan, en euro… Pubeka garde le budget en centimes de dollar (la valeur qui fait
// foi, CONVENTIONS §6) et le convertit ICI avec le taux enregistré (table `exchange_rates`, jamais un taux codé en dur).
//
// Décalage (« offset ») de chaque monnaie : https://developers.facebook.com/docs/marketing-api/currencies (« Currency codes »,
// page mise à jour le 30 juin 2026) : « si une monnaie a un décalage de 100, la plus petite valeur vaut 1/100 de l'unité ;
// avec un décalage de 1, elle vaut une unité ». Le franc CFA (XAF, XOF) ne figure PAS dans cette table : un compte dans une
// monnaie absente est refusé avec un message clair, jamais converti au hasard.
import type { AccountCurrency } from '../types';
import { MetaValidationError } from './errors';

export const META_CURRENCY_OFFSET: Readonly<Record<string, 1 | 100>> = {
  DZD: 100,
  ARS: 100,
  AUD: 100,
  BHD: 100,
  BDT: 100,
  BOB: 100,
  BGN: 100,
  BRL: 100,
  GBP: 100,
  CAD: 100,
  CLP: 1,
  CNY: 100,
  COP: 1,
  CRC: 1,
  HRK: 100,
  CZK: 100,
  DKK: 100,
  EGP: 100,
  EUR: 100,
  GTQ: 100,
  HNL: 100,
  HKD: 100,
  HUF: 1,
  ISK: 1,
  INR: 100,
  IDR: 1,
  ILS: 100,
  JPY: 1,
  JOD: 100,
  KES: 100,
  KRW: 1,
  LVL: 100,
  LTL: 100,
  MOP: 100,
  MYR: 100,
  MXN: 100,
  NZD: 100,
  NIO: 100,
  NGN: 100,
  NOK: 100,
  PKR: 100,
  PYG: 1,
  PEN: 100,
  PHP: 100,
  PLN: 100,
  QAR: 100,
  RON: 100,
  RUB: 100,
  SAR: 100,
  RSD: 100,
  SGD: 100,
  SKK: 100,
  ZAR: 100,
  SEK: 100,
  CHF: 100,
  TWD: 1,
  THB: 100,
  TRY: 100,
  AED: 100,
  UAH: 100,
  USD: 100,
  UYU: 100,
  VEF: 100,
  VND: 1,
  FBZ: 100,
  VES: 100,
};

/** Budget minimum imposé par Pubeka : 1 $ par jour (TR-PLA-10). */
export const PUBEKA_MIN_DAILY_USD_CENTS = 100;

export function metaCurrencyOffset(code: string): 1 | 100 {
  if (!Object.hasOwn(META_CURRENCY_OFFSET, code)) {
    throw new MetaValidationError(
      `La monnaie de ce compte publicitaire (${code === '' ? 'inconnue' : code}) n’est pas prise en charge par Pubeka. ` +
        'Utilisez un compte publicitaire dans une monnaie acceptée par Meta (par exemple le dollar).',
    );
  }
  return META_CURRENCY_OFFSET[code] ?? 100;
}

const SCALE = 10_000n;

function scaledRate(account: AccountCurrency): bigint {
  if (account.code === 'USD') return SCALE;
  const rate = account.perUsd;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    throw new MetaValidationError(
      `Le taux de change du dollar vers ${account.code} est absent ou invalide : le budget ne peut pas être converti.`,
    );
  }
  const scaled = BigInt(Math.round(rate * 10_000));
  if (scaled <= 0n) throw new MetaValidationError('Le taux de change est trop petit.');
  return scaled;
}

function assertCents(usdCents: number): bigint {
  if (!Number.isSafeInteger(usdCents) || usdCents < 0) {
    throw new MetaValidationError('Le budget doit être un nombre entier de centimes de dollar.');
  }
  return BigInt(usdCents);
}

function convert(usdCents: number, account: AccountCurrency, rounding: 'half_up' | 'up'): number {
  const offset = BigInt(metaCurrencyOffset(account.code));
  const cents = assertCents(usdCents);
  const numerator = cents * scaledRate(account) * offset;
  const denominator = 100n * SCALE;
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (rounding === 'up' ? remainder > 0n : remainder * 2n >= denominator) quotient += 1n;
  const result = Number(quotient);
  if (!Number.isSafeInteger(result))
    throw new MetaValidationError('Le budget converti est trop grand.');
  return result;
}

/** Centimes de dollar → unité mineure de la monnaie du compte (arrondi au plus proche, 0,5 monte). */
export function usdCentsToAccountMinor(usdCents: number, account: AccountCurrency): number {
  return convert(usdCents, account, 'half_up');
}

/** Le minimum de Pubeka (1 $ par jour) dans la monnaie du compte, arrondi vers le haut : jamais en dessous de 1 $. */
export function accountMinPerDayMinor(account: AccountCurrency): number {
  return convert(PUBEKA_MIN_DAILY_USD_CENTS, account, 'up');
}
