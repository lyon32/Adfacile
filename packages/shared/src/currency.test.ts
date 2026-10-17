// Unités mineures des monnaies (ISO 4217) et conversion dollars -> monnaie locale, en entiers (CONVENTIONS §6.6).
// Les taux écrits ici sont des VALEURS D'ESSAI (le calcul doit marcher pour n'importe quel taux), pas des données du produit.
import { describe, expect, it } from 'vitest';
import {
  AFRICAN_CURRENCIES,
  convertUsdCents,
  formatMinorUnits,
  isKnownCurrency,
  minorUnits,
} from './currency';

describe('minorUnits : exposant ISO 4217 (SIX, liste 1)', () => {
  it.each([
    ['XAF', 0],
    ['XOF', 0],
    ['NGN', 2],
    ['TND', 3],
    ['LYD', 3],
    ['UGX', 0],
    ['RWF', 0],
    ['GNF', 0],
    ['BIF', 0],
    ['KMF', 0],
    ['DJF', 0],
    ['ZAR', 2],
    ['USD', 2],
    ['MGA', 2],
    ['SOS', 2],
  ])('%s : %i décimale(s)', (code, digits) => {
    expect(minorUnits(code)).toBe(digits);
  });

  it('une monnaie inconnue lève une erreur, jamais un 2 par défaut', () => {
    expect(() => minorUnits('XXX')).toThrow(RangeError);
    expect(() => minorUnits('xaf')).toThrow(RangeError);
    expect(() => minorUnits('')).toThrow(RangeError);
    expect(isKnownCurrency('NGN')).toBe(true);
    expect(isKnownCurrency('EUR')).toBe(false);
  });

  it('chaque monnaie africaine a un exposant entier entre 0 et 3', () => {
    expect(AFRICAN_CURRENCIES.length).toBe(42);
    for (const code of AFRICAN_CURRENCIES) {
      const digits = minorUnits(code);
      expect(Number.isInteger(digits) && digits >= 0 && digits <= 3, code).toBe(true);
    }
  });

  it('recoupe CLDR (Intl) sauf deux écarts connus : MGA et SOS (CLDR 0, ISO 4217 : 2)', () => {
    const known = new Set(['MGA', 'SOS']);
    for (const code of [...AFRICAN_CURRENCIES, 'USD']) {
      const cldr = new Intl.NumberFormat('en', {
        style: 'currency',
        currency: code,
      }).resolvedOptions().maximumFractionDigits;
      if (known.has(code)) expect(cldr, code).not.toBe(minorUnits(code));
      else expect(cldr, code).toBe(minorUnits(code));
    }
  });
});

describe('convertUsdCents : centimes de dollar -> unités mineures locales, demi vers le haut', () => {
  it('XAF (0 décimale) : 3 500 centimes à 600 = 21 000', () => {
    expect(convertUsdCents(3500, 600, 'XAF')).toBe(21000);
  });
  it('NGN (2 décimales) : 3 500 centimes à 1 500 = 52 500,00 NGN = 5 250 000 kobo', () => {
    expect(convertUsdCents(3500, 1500, 'NGN')).toBe(5_250_000);
  });
  it('TND (3 décimales) : 3 500 centimes à 3,1 = 108,500 TND = 108 500 millimes', () => {
    expect(convertUsdCents(3500, 3.1, 'TND')).toBe(108_500);
  });
  it('UGX (0 décimale) : 100 centimes à 3 700,5 = 3 701 (3 700,5 monte)', () => {
    expect(convertUsdCents(100, 3700.5, 'UGX')).toBe(3701);
    expect(convertUsdCents(100, 3700.4999, 'UGX')).toBe(3700);
  });
  it('taux au dix-millième : 1 centime à 15,1234 NGN = 0,151234 NGN = 15 kobo', () => {
    expect(convertUsdCents(1, 15.1234, 'NGN')).toBe(15);
  });
  it('zéro centime donne zéro', () => {
    expect(convertUsdCents(0, 600, 'XAF')).toBe(0);
  });
  it('plus grand cas permis (365 000 000 centimes à 4 000 UGX) reste un entier sûr et exact', () => {
    const v = convertUsdCents(365_000_000, 4000, 'UGX');
    expect(v).toBe(14_600_000_000);
    expect(Number.isSafeInteger(v)).toBe(true);
  });
  it('refuse un taux nul, négatif ou non fini, et des centimes non entiers ou négatifs', () => {
    expect(() => convertUsdCents(100, 0, 'XAF')).toThrow(RangeError);
    expect(() => convertUsdCents(100, -1, 'XAF')).toThrow(RangeError);
    expect(() => convertUsdCents(100, Number.NaN, 'XAF')).toThrow(RangeError);
    expect(() => convertUsdCents(100, Number.POSITIVE_INFINITY, 'XAF')).toThrow(RangeError);
    expect(() => convertUsdCents(10.5, 600, 'XAF')).toThrow(RangeError);
    expect(() => convertUsdCents(-1, 600, 'XAF')).toThrow(RangeError);
    expect(() => convertUsdCents(100, 600, 'XXX')).toThrow(RangeError);
  });
});

describe('formatMinorUnits : texte décimal exact, sans flottant', () => {
  it.each([
    [21000, 'XAF', '21000'],
    [5_250_000, 'NGN', '52500.00'],
    [108_500, 'TND', '108.500'],
    [5, 'NGN', '0.05'],
    [0, 'TND', '0.000'],
    [-1234, 'NGN', '-12.34'],
  ])('%i %s -> %s', (minor, code, text) => {
    expect(formatMinorUnits(minor, code)).toBe(text);
  });
});
