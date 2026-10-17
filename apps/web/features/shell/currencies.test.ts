// Monnaie d'affichage : la zone franc CFA garde le choix XAF / XOF, tout autre pays a la monnaie de son pays.
import { describe, expect, it } from 'vitest';
import { currencyLabel, currencyOptions } from './currencies';

describe('currencyLabel', () => {
  it('FCFA pour XAF et XOF, en français comme en anglais', () => {
    expect(currencyLabel('XAF', 'fr')).toBe('FCFA (XAF)');
    expect(currencyLabel('XOF', 'en')).toBe('FCFA (XOF)');
  });
  it('autres monnaies : nom officiel dans la langue puis le code ISO', () => {
    expect(currencyLabel('NGN', 'fr')).toBe('naira nigérian (NGN)');
    expect(currencyLabel('NGN', 'en')).toBe('Nigerian Naira (NGN)');
    expect(currencyLabel('TND', 'fr')).toMatch(/\(TND\)$/);
  });
  it('un code inconnu d’Intl reste lisible : le code seul', () => {
    expect(currencyLabel('ZZZ', 'fr')).toMatch(/\(ZZZ\)$/);
  });
});

describe('currencyOptions', () => {
  it('pays de la zone XAF ou XOF : les deux FCFA, la monnaie du pays d’abord', () => {
    expect(currencyOptions('XAF', 'fr').map((o) => o.value)).toEqual(['XAF', 'XOF']);
    expect(currencyOptions('XOF', 'fr').map((o) => o.value)).toEqual(['XOF', 'XAF']);
  });
  it('autre pays : sa seule monnaie', () => {
    expect(currencyOptions('NGN', 'en')).toEqual([{ value: 'NGN', label: 'Nigerian Naira (NGN)' }]);
  });
});
