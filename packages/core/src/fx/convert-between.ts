// Conversion entre deux monnaies PAR LE DOLLAR, en entiers (CONVENTIONS §6.6), avec les taux stockés (`exchange_rates` :
// unités de monnaie pour 1 $). Sert à S17 : le client voit ses dépenses dans SA monnaie quand celle du compte publicitaire
// (dollar, euro…) n'est pas la sienne. Aucun taux n'est codé en dur ni inventé : l'appelant fournit des taux frais.
//
// Calcul exact : montant × taux_cible × 10^décimales_cible ÷ (taux_source × 10^décimales_source), taux ramenés en entiers au
// dix-millième (comme `convertUsdCents`), arrondi AU PLUS PROCHE, 0,5 s'éloigne de zéro, une seule fois, à la fin (jamais un
// arrondi intermédiaire en dollars). BigInt : aucun flottant n'entre dans le montant.
import { minorUnits } from '@pubeka/shared';

export interface CurrencyRate {
  /** Code ISO 4217 (monnaie prise en charge : Afrique, dollar, euro). */
  code: string;
  /** Unités de cette monnaie pour 1 $ (le dollar vaut 1). */
  perUsd: number;
}

const SCALE = 10_000;

function scaledRate({ code, perUsd }: CurrencyRate): bigint {
  if (!Number.isFinite(perUsd) || perUsd <= 0)
    throw new RangeError(`Le taux de ${code} doit être positif et fini`);
  const scaled = Math.round(perUsd * SCALE);
  if (scaled <= 0) throw new RangeError(`Le taux de ${code} est trop petit`);
  return BigInt(scaled);
}

/** Convertit un montant en unités mineures de `from` vers les unités mineures de `to`. La même monnaie ne bouge pas. */
export function convertBetweenCurrencies(
  amountMinor: number,
  from: CurrencyRate,
  to: CurrencyRate,
): number {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('Le montant doit être un entier');
  const fromDigits = minorUnits(from.code);
  const toDigits = minorUnits(to.code);
  const fromRate = scaledRate(from);
  const toRate = scaledRate(to);
  if (from.code === to.code) return amountMinor;
  const numerator = BigInt(amountMinor) * toRate * 10n ** BigInt(toDigits);
  const denominator = fromRate * 10n ** BigInt(fromDigits);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let quotient = abs / denominator;
  if ((abs % denominator) * 2n >= denominator) quotient += 1n;
  return Number(negative ? -quotient : quotient);
}

export interface DisplayedAmount {
  amountMinor: number;
  currency: string;
  /** Vrai si le montant a été converti (monnaie du compte ≠ monnaie du client). */
  converted: boolean;
}

/**
 * Règle d'affichage (décision du 18/10/2026) : si la monnaie du compte publicitaire est la MÊME que celle choisie dans Pubeka,
 * le montant est montré tel quel ; sinon il est converti avec les taux stockés pour que le client comprenne ce qu'il dépense.
 */
export function displayInClientCurrency(
  amountMinor: number,
  account: CurrencyRate,
  client: CurrencyRate,
): DisplayedAmount {
  if (account.code === client.code) {
    return { amountMinor, currency: client.code, converted: false };
  }
  return {
    amountMinor: convertBetweenCurrencies(amountMinor, account, client),
    currency: client.code,
    converted: true,
  };
}
