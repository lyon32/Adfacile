import { describe, expect, it } from 'vitest';
import {
  DEFAULT_XAF_PER_USD,
  fcfaToUsdCents,
  FB_MIN_DAILY_BUDGET_CENTS,
  minDailyBudgetFcfa,
} from './currency';

describe('currency — FCFA vers centimes de dollar (comportement AdFacile conservé)', () => {
  it('convertit au taux par défaut de 610 FCFA pour 1 $', () => {
    expect(DEFAULT_XAF_PER_USD).toBe(610);
    expect(fcfaToUsdCents(610)).toBe(100);
    expect(fcfaToUsdCents(1000)).toBe(164);
    expect(fcfaToUsdCents('6100')).toBe(1000);
  });

  it('utilise le taux fourni, et revient au défaut si le taux est invalide', () => {
    expect(fcfaToUsdCents(600, 600)).toBe(100);
    expect(fcfaToUsdCents(610, 0)).toBe(100);
    expect(fcfaToUsdCents(610, Number.NaN)).toBe(100);
  });

  it('renvoie NaN pour une entrée qui n’est pas un nombre', () => {
    expect(fcfaToUsdCents('abc')).toBeNaN();
  });

  it('le minimum de Meta (1 $) vaut 700 FCFA au taux par défaut, arrondi à la centaine supérieure', () => {
    expect(FB_MIN_DAILY_BUDGET_CENTS).toBe(100);
    expect(minDailyBudgetFcfa()).toBe(700);
    expect(minDailyBudgetFcfa(655)).toBe(700);
    expect(minDailyBudgetFcfa(600)).toBe(600);
  });
});
