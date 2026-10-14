// Conversion FCFA → devise du compte publicitaire (dollars américains).
// Porté de backend/src/utils/currency.js. L'utilisateur saisit des FCFA, le compte Meta est en USD
// et Meta attend des centimes. Tous les montants sont des entiers.
//
// ÉCART ASSUMÉ avec AdFacile : le taux n'est plus lu dans l'environnement (`XAF_PER_USD`) et il n'y a plus
// de taux par défaut silencieux (610). Le taux est OBLIGATOIRE : `core` le lit dans la table des taux de
// change de `billing` (S24) et le passe à chaque appel. Un taux absent ou invalide lève une erreur au lieu
// de convertir un budget avec un cours périmé.
import { AppError } from '@pubeka/contracts';

/** Budget quotidien minimum imposé par Meta sur un compte en USD : 1,00 $ (TR-PLA-10). */
export const FB_MIN_DAILY_BUDGET_CENTS = 100;

export const ACCOUNT_CURRENCY = 'USD';

/** Combien de FCFA pour 1 $ ; doit être un nombre fini strictement positif. */
function assertRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new AppError('internal_error', {
      cause: new Error('taux de change FCFA/USD absent ou invalide'),
    });
  }
  return rate;
}

/** Convertit un montant en FCFA vers des centimes de dollar ; NaN si l'entrée est invalide. */
export function fcfaToUsdCents(fcfa: number | string, xafPerUsd: number): number {
  const rate = assertRate(xafPerUsd);
  const amount = Number(fcfa);
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round((amount / rate) * 100);
}

/** Montant en FCFA du minimum exigé par Meta, arrondi à la centaine supérieure. */
export function minDailyBudgetFcfa(xafPerUsd: number): number {
  return Math.ceil(((FB_MIN_DAILY_BUDGET_CENTS / 100) * assertRate(xafPerUsd)) / 100) * 100;
}
