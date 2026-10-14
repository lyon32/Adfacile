import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import { fcfaToUsdCents, FB_MIN_DAILY_BUDGET_CENTS, minDailyBudgetFcfa } from './currency';

// Le taux de 610 FCFA pour 1 $ était le défaut d'AdFacile : il n'existe plus que dans ces tests, qui
// reprennent les valeurs d'origine.
const TAUX_ADFACILE = 610;

describe('currency — FCFA vers centimes de dollar', () => {
  it('convertit au taux fourni (valeurs d’AdFacile à 610 FCFA pour 1 $)', () => {
    expect(fcfaToUsdCents(610, TAUX_ADFACILE)).toBe(100);
    expect(fcfaToUsdCents(1000, TAUX_ADFACILE)).toBe(164);
    expect(fcfaToUsdCents('6100', TAUX_ADFACILE)).toBe(1000);
    expect(fcfaToUsdCents(600, 600)).toBe(100);
  });

  it('exige un taux : absent, nul, négatif ou non numérique → erreur, jamais de défaut silencieux', () => {
    for (const rate of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fcfaToUsdCents(610, rate)).toThrow(AppError);
      expect(() => minDailyBudgetFcfa(rate)).toThrow(AppError);
    }
    // @ts-expect-error le taux est un paramètre obligatoire
    expect(() => fcfaToUsdCents(610)).toThrow(AppError);
  });

  it('renvoie NaN pour une entrée qui n’est pas un nombre', () => {
    expect(fcfaToUsdCents('abc', TAUX_ADFACILE)).toBeNaN();
  });

  it('le minimum de Meta (1 $) vaut 700 FCFA à 610, arrondi à la centaine supérieure', () => {
    expect(FB_MIN_DAILY_BUDGET_CENTS).toBe(100);
    expect(minDailyBudgetFcfa(TAUX_ADFACILE)).toBe(700);
    expect(minDailyBudgetFcfa(655)).toBe(700);
    expect(minDailyBudgetFcfa(600)).toBe(600);
  });
});
