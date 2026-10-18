// Budget minimum de Pubeka (TR-PLA-10). La conversion vers la monnaie du compte publicitaire est dans
// `account-currency.ts` : elle ne suppose plus que le compte est en dollars, et n'utilise plus de taux FCFA.
//
// ÉCART ASSUMÉ avec AdFacile : plus de `XAF_PER_USD`, plus de taux par défaut (610), plus de conversion FCFA -> dollars
// dans le connecteur. `core` lit le taux enregistré (table `exchange_rates`) et le passe avec la monnaie du compte.
import { PUBEKA_MIN_DAILY_USD_CENTS } from './account-currency';

/** Budget quotidien minimum imposé par Pubeka : 1,00 $ (TR-PLA-10). */
export const FB_MIN_DAILY_BUDGET_CENTS = PUBEKA_MIN_DAILY_USD_CENTS;
