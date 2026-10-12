import { describe, expect, it } from 'vitest';
import {
  addMoney,
  applyRate,
  compareMoney,
  createMoney,
  isNegative,
  multiplyMoney,
  subtractMoney,
  usdCents,
  xaf,
} from './money';

describe('Money (CONVENTIONS §6.6)', () => {
  it('refuse un montant à virgule', () => {
    expect(() => xaf(10.5)).toThrow(RangeError);
  });

  it('refuse un montant hors des entiers sûrs', () => {
    expect(() => createMoney(Number.MAX_SAFE_INTEGER + 1, 'XAF')).toThrow(RangeError);
  });

  it('additionne et soustrait dans la même devise', () => {
    expect(addMoney(xaf(1500), xaf(500))).toEqual({ amountMinor: 2000, currency: 'XAF' });
    expect(subtractMoney(usdCents(100), usdCents(250))).toEqual(usdCents(-150));
  });

  it('refuse de mélanger deux devises', () => {
    expect(() => addMoney(xaf(1), usdCents(1))).toThrow(TypeError);
  });

  it('multiplie par une quantité entière seulement', () => {
    expect(multiplyMoney(xaf(250), 4)).toEqual(xaf(1000));
    expect(() => multiplyMoney(xaf(250), 1.5)).toThrow(RangeError);
  });

  it('applique un taux avec un arrondi explicite', () => {
    expect(applyRate(xaf(999), 85, 100, 'up')).toEqual(xaf(850));
    expect(applyRate(xaf(999), 85, 100, 'down')).toEqual(xaf(849));
    expect(applyRate(xaf(10), 1, 4, 'half_up')).toEqual(xaf(3));
    expect(applyRate(xaf(10), 1, 3, 'half_up')).toEqual(xaf(3));
    expect(applyRate(xaf(1000), 1, 4, 'up')).toEqual(xaf(250));
  });

  it('arrondit les montants négatifs vers −∞ (down) et +∞ (up)', () => {
    expect(applyRate(xaf(-10), 1, 3, 'down')).toEqual(xaf(-4));
    expect(applyRate(xaf(-10), 1, 3, 'up')).toEqual(xaf(-3));
    expect(applyRate(xaf(-10), 1, 4, 'half_up')).toEqual(xaf(-3));
  });

  it('refuse un dénominateur nul ou négatif', () => {
    expect(() => applyRate(xaf(10), 1, 0, 'up')).toThrow(RangeError);
  });

  it('compare deux montants', () => {
    expect(compareMoney(xaf(1), xaf(2))).toBe(-1);
    expect(compareMoney(xaf(2), xaf(2))).toBe(0);
    expect(compareMoney(xaf(3), xaf(2))).toBe(1);
    expect(isNegative(xaf(-1))).toBe(true);
    expect(isNegative(xaf(0))).toBe(false);
  });
});
