// Conversion FCFA → devise du compte publicitaire (dollars américains).
// Porté de backend/src/utils/currency.js. L'utilisateur saisit des FCFA, le compte Meta est en USD
// et Meta attend des centimes. Différence assumée avec l'existant : le taux n'est plus lu dans
// l'environnement (`XAF_PER_USD`) ; l'appelant le fournit (table des taux de `billing`, S24), et
// 610 reste la valeur par défaut. Tous les montants sont des entiers.

/** Combien de FCFA pour 1 USD. Le XAF est arrimé à l'euro (655,957 XAF = 1 EUR) : à revoir périodiquement. */
export const DEFAULT_XAF_PER_USD = 610;

/** Budget quotidien minimum imposé par Meta sur un compte en USD : 1,00 $ (TR-PLA-10). */
export const FB_MIN_DAILY_BUDGET_CENTS = 100;

export const ACCOUNT_CURRENCY = 'USD';

function validRate(rate: number | undefined): number {
  return rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_XAF_PER_USD;
}

/** Convertit un montant en FCFA vers des centimes de dollar ; NaN si l'entrée est invalide. */
export function fcfaToUsdCents(fcfa: number | string, xafPerUsd?: number): number {
  const amount = Number(fcfa);
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round((amount / validRate(xafPerUsd)) * 100);
}

/** Montant en FCFA du minimum exigé par Meta, arrondi à la centaine supérieure. */
export function minDailyBudgetFcfa(xafPerUsd?: number): number {
  return Math.ceil(((FB_MIN_DAILY_BUDGET_CENTS / 100) * validRate(xafPerUsd)) / 100) * 100;
}
