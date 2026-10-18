// Conversion « monnaie du compte publicitaire → monnaie du client » (S17 l'affichera) : par le dollar, en ENTIERS, avec un arrondi
// explicite (au plus proche, 0,5 monte), et la règle d'affichage du 18/10/2026 : même monnaie → montant tel quel ; sinon conversion
// avec les taux stockés. Tous les taux ci-dessous sont des VALEURS D'ESSAI, pas des données du produit.
import { describe, expect, it } from 'vitest';
import { convertBetweenCurrencies, displayInClientCurrency } from './convert-between';

const EUR = { code: 'EUR', perUsd: 0.9 };
const XAF = { code: 'XAF', perUsd: 600 };
const NGN = { code: 'NGN', perUsd: 1500 };
const USD = { code: 'USD', perUsd: 1 };

describe('convertBetweenCurrencies — par le dollar, en entiers', () => {
  it('EUR → XAF : 100,00 EUR à 0,9 EUR/$ et 600 XAF/$ = 111,111… $ = 66 666,67 XAF, arrondi au plus proche → 66 667 FCFA (sans subdivision)', () => {
    expect(convertBetweenCurrencies(10_000, EUR, XAF)).toBe(66_667);
  });

  it('XAF → EUR : 66 667 FCFA redonnent 100,00 EUR (arrondi explicite au centime)', () => {
    expect(convertBetweenCurrencies(66_667, XAF, EUR)).toBe(10_000);
  });

  it('EUR → NGN (2 décimales des deux côtés) : 10,00 EUR = 11,11 $ = 16 666,67 NGN = 1 666 667 unités mineures', () => {
    expect(convertBetweenCurrencies(1000, EUR, NGN)).toBe(1_666_667);
  });

  it('USD est la base : taux 1 ; 10,00 $ → XAF = 6 000 FCFA ; 6 000 FCFA → 1 000 centimes', () => {
    expect(convertBetweenCurrencies(1000, USD, XAF)).toBe(6000);
    expect(convertBetweenCurrencies(6000, XAF, USD)).toBe(1000);
  });

  it('la même monnaie ne bouge pas (aucun aller-retour, aucun arrondi)', () => {
    expect(convertBetweenCurrencies(12_345, EUR, EUR)).toBe(12_345);
    expect(convertBetweenCurrencies(777, XAF, XAF)).toBe(777);
  });

  it('arrondit 0,5 vers le haut, jamais vers le bas, sans flottant dans le montant', () => {
    // 1 FCFA = 1/600 $ ; × 0,9 EUR/$ = 0,0015 EUR = 0,15 centime → 0 ; 4 FCFA = 0,6 centime → 1
    expect(convertBetweenCurrencies(1, XAF, EUR)).toBe(0);
    expect(convertBetweenCurrencies(4, XAF, EUR)).toBe(1);
    // exactement 0,5 : 1 centime d'EUR à taux égaux vers une monnaie à 0 décimale
    expect(
      convertBetweenCurrencies(1, { code: 'EUR', perUsd: 1 }, { code: 'XAF', perUsd: 50 }),
    ).toBe(1);
  });

  it('un montant nul reste nul ; un montant négatif (remboursement) garde son signe', () => {
    expect(convertBetweenCurrencies(0, EUR, XAF)).toBe(0);
    expect(convertBetweenCurrencies(-10_000, EUR, XAF)).toBe(-66_667);
  });

  it('les gros montants restent exacts (BigInt interne)', () => {
    expect(convertBetweenCurrencies(100_000_000_00, EUR, XAF)).toBe(66_666_666_667);
  });

  it.each([
    ['taux nul', { code: 'EUR', perUsd: 0 }],
    ['taux négatif', { code: 'EUR', perUsd: -1 }],
    ['taux non fini', { code: 'EUR', perUsd: Number.POSITIVE_INFINITY }],
    ['taux NaN', { code: 'EUR', perUsd: Number.NaN }],
  ])('refuse %s : aucun taux inventé', (_name, bad) => {
    expect(() => convertBetweenCurrencies(100, bad, XAF)).toThrow(RangeError);
    expect(() => convertBetweenCurrencies(100, XAF, bad)).toThrow(RangeError);
  });

  it('refuse une monnaie non prise en charge et un montant non entier', () => {
    expect(() => convertBetweenCurrencies(100, { code: 'GBP', perUsd: 0.8 }, XAF)).toThrow(
      RangeError,
    );
    expect(() => convertBetweenCurrencies(1.5, EUR, XAF)).toThrow(RangeError);
  });
});

describe('displayInClientCurrency — règle d’affichage du 18/10/2026', () => {
  it('compte en NGN, client au Nigeria (NGN) : montant TEL QUEL, pas converti', () => {
    expect(displayInClientCurrency(250_000, NGN, NGN)).toEqual({
      amountMinor: 250_000,
      currency: 'NGN',
      converted: false,
    });
  });

  it('compte en dollars, client au Cameroun (XAF) : converti pour que le client comprenne', () => {
    expect(displayInClientCurrency(1000, USD, XAF)).toEqual({
      amountMinor: 6000,
      currency: 'XAF',
      converted: true,
    });
  });

  it('compte en euros, client au Cameroun : converti par le dollar', () => {
    expect(displayInClientCurrency(10_000, EUR, XAF)).toEqual({
      amountMinor: 66_667,
      currency: 'XAF',
      converted: true,
    });
  });

  it('même code mais taux différents : toujours tel quel (le taux ne sert qu’aux conversions)', () => {
    expect(
      displayInClientCurrency(500, { code: 'XAF', perUsd: 590 }, { code: 'XAF', perUsd: 610 }),
    ).toMatchObject({
      amountMinor: 500,
      converted: false,
    });
  });
});
