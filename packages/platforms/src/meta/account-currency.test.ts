import { describe, expect, it } from 'vitest';
import {
  accountMinPerDayMinor,
  META_CURRENCY_OFFSET,
  metaCurrencyOffset,
  usdCentsToAccountMinor,
} from './account-currency';

// Source des décalages (« offset ») : https://developers.facebook.com/docs/marketing-api/currencies
// (page « Currency codes », mise à jour le 30 juin 2026). Un décalage de 100 = l'unité mineure vaut 1/100 de l'unité ;
// un décalage de 1 = l'unité mineure est l'unité elle-même (yen, won, peso chilien…).
// Les taux ci-dessous sont des VALEURS D'ESSAI de ces tests, jamais des valeurs du produit.
describe('monnaie du compte publicitaire — décalages de Meta', () => {
  it('reprend les décalages de la documentation de Meta (dollar, naira, shilling, rand…)', () => {
    expect(metaCurrencyOffset('USD')).toBe(100);
    expect(metaCurrencyOffset('NGN')).toBe(100);
    expect(metaCurrencyOffset('KES')).toBe(100);
    expect(metaCurrencyOffset('ZAR')).toBe(100);
    expect(metaCurrencyOffset('EGP')).toBe(100);
    expect(metaCurrencyOffset('DZD')).toBe(100);
    expect(metaCurrencyOffset('EUR')).toBe(100);
    expect(metaCurrencyOffset('JPY')).toBe(1);
    expect(metaCurrencyOffset('CLP')).toBe(1);
    expect(metaCurrencyOffset('KRW')).toBe(1);
  });

  it('refuse une monnaie absente de la table de Meta, sans inventer de décalage (le franc CFA y est absent)', () => {
    for (const code of ['XAF', 'XOF', 'GHS', 'ABC', '', 'usd', 'USD ']) {
      expect(() => metaCurrencyOffset(code)).toThrow(/prise en charge/);
    }
  });

  it('la table ne contient que des décalages 1 ou 100 et des codes ISO à trois lettres', () => {
    for (const [code, offset] of Object.entries(META_CURRENCY_OFFSET)) {
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect([1, 100]).toContain(offset);
    }
  });
});

describe('budget en centimes de dollar → unité mineure de la monnaie du compte', () => {
  it('un compte en dollars : le budget passe tel quel, sans taux', () => {
    expect(usdCentsToAccountMinor(500, { code: 'USD' })).toBe(500);
    expect(usdCentsToAccountMinor(100, { code: 'USD' })).toBe(100);
  });

  it('un compte en dollars ignore un taux qui lui serait donné par erreur', () => {
    expect(usdCentsToAccountMinor(500, { code: 'USD', perUsd: 600 })).toBe(500);
  });

  it('un compte en naira (décalage 100) : 5 $ à 1 500 NGN pour 1 $ = 7 500,00 NGN = 750 000 unités mineures', () => {
    expect(usdCentsToAccountMinor(500, { code: 'NGN', perUsd: 1500 })).toBe(750_000);
  });

  it('un compte en yen (décalage 1) : 5 $ à 150 JPY pour 1 $ = 750 JPY', () => {
    expect(usdCentsToAccountMinor(500, { code: 'JPY', perUsd: 150 })).toBe(750);
  });

  it('arrondit au plus proche, 0,5 monte, sans flottant dans le calcul', () => {
    // 1 $ à 1 500,005 : 1 500,005 NGN = 150 000,5 unités mineures → 150 001
    expect(usdCentsToAccountMinor(100, { code: 'NGN', perUsd: 1500.005 })).toBe(150_001);
    // 1 $ à 1 500,004 : 150 000,4 → 150 000
    expect(usdCentsToAccountMinor(100, { code: 'NGN', perUsd: 1500.004 })).toBe(150_000);
  });

  it('refuse un compte hors dollar sans taux, ou avec un taux nul, négatif ou non fini : aucun taux inventé', () => {
    for (const perUsd of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        usdCentsToAccountMinor(
          500,
          perUsd === undefined ? { code: 'NGN' } : { code: 'NGN', perUsd },
        ),
      ).toThrow(/taux/i);
    }
  });

  it('refuse une monnaie non prise en charge avant tout calcul', () => {
    expect(() => usdCentsToAccountMinor(500, { code: 'XAF', perUsd: 600 })).toThrow(
      /prise en charge/,
    );
  });

  it('refuse des centimes qui ne sont pas des entiers positifs', () => {
    for (const cents of [-1, 1.5, Number.NaN, 2 ** 60]) {
      expect(() => usdCentsToAccountMinor(cents, { code: 'USD' })).toThrow();
    }
  });
});

describe('compte en euros (décalage 100 dans la table de Meta, relevée le 18/10/2026)', () => {
  it('EUR figure dans la liste officielle avec le décalage 100', () => {
    expect(metaCurrencyOffset('EUR')).toBe(100);
  });

  it('10 $ à 0,9 EUR pour 1 $ (taux d’essai) = 9,00 EUR = 900 unités mineures ; 5 $ = 4,50 EUR = 450', () => {
    expect(usdCentsToAccountMinor(1000, { code: 'EUR', perUsd: 0.9 })).toBe(900);
    expect(usdCentsToAccountMinor(500, { code: 'EUR', perUsd: 0.9 })).toBe(450);
  });

  it('le minimum de 1 $ par jour vaut 0,90 EUR = 90 unités mineures, arrondi au-dessus (jamais sous 1 $)', () => {
    expect(accountMinPerDayMinor({ code: 'EUR', perUsd: 0.9 })).toBe(90);
    expect(accountMinPerDayMinor({ code: 'EUR', perUsd: 0.9051 })).toBe(91);
  });

  it('sans taux, un compte en euros est refusé (aucun taux inventé)', () => {
    expect(() => usdCentsToAccountMinor(500, { code: 'EUR' })).toThrow();
  });
});

describe('minimum imposé par Pubeka (TR-PLA-10 : 1 $ par jour) dans la monnaie du compte', () => {
  it('vaut 100 unités mineures sur un compte en dollars', () => {
    expect(accountMinPerDayMinor({ code: 'USD' })).toBe(100);
  });

  it('est arrondi à l’unité mineure supérieure : jamais un minimum plus bas que 1 $', () => {
    // 1 $ à 1 500,001 NGN = 150 000,1 → 150 001 (et non 150 000)
    expect(accountMinPerDayMinor({ code: 'NGN', perUsd: 1500.001 })).toBe(150_001);
    expect(accountMinPerDayMinor({ code: 'JPY', perUsd: 150.4 })).toBe(151);
  });
});
