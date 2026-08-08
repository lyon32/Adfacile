/**
 * Conversion FCFA → devise du compte publicitaire
 * AdsFacile Backend
 *
 * L'utilisateur saisit des montants en FCFA, mais le compte publicitaire Meta
 * est libellé en USD. Meta attend les montants dans l'unité mineure de la
 * devise du compte, soit des cents pour l'USD.
 *
 * Le taux est configurable par variable d'environnement afin d'être ajusté
 * sans redéploiement du code.
 */

// Combien de FCFA pour 1 USD. Le XAF est arrimé à l'euro (655,957 XAF = 1 EUR),
// donc ce taux suit le cours EUR/USD et mérite d'être revu périodiquement.
const DEFAULT_XAF_PER_USD = 610;

// Budget quotidien minimum imposé par Meta sur un compte en USD : 1,00 $.
const FB_MIN_DAILY_BUDGET_CENTS = 100;

const getRate = () => {
  const configured = Number(process.env.XAF_PER_USD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_XAF_PER_USD;
};

/**
 * Convertit un montant en FCFA vers des cents USD, prêts pour l'API Meta.
 * @param {number|string} fcfa
 * @returns {number} montant en cents USD, ou NaN si l'entrée est invalide
 */
const fcfaToUsdCents = (fcfa) => {
  const amount = Number(fcfa);
  if (!Number.isFinite(amount)) return NaN;
  return Math.round((amount / getRate()) * 100);
};

/**
 * Montant en FCFA correspondant au minimum exigé par Meta, arrondi à la
 * centaine supérieure pour donner une consigne lisible à l'utilisateur.
 * @returns {number}
 */
const minDailyBudgetFcfa = () =>
  Math.ceil(((FB_MIN_DAILY_BUDGET_CENTS / 100) * getRate()) / 100) * 100;

module.exports = {
  getRate,
  fcfaToUsdCents,
  minDailyBudgetFcfa,
  FB_MIN_DAILY_BUDGET_CENTS,
  ACCOUNT_CURRENCY: 'USD'
};
