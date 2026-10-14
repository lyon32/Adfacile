import { describe, expect, it } from 'vitest';
import { compare, flatten } from './check';
import { messagesFor, pickLocale } from './index';

describe('textes FR/EN (TR-PLT-03)', () => {
  it('TR-PLT-03 : le français et l’anglais ont les mêmes clés et les mêmes variables', () => {
    expect(compare(flatten(messagesFor('fr')), flatten(messagesFor('en')))).toEqual([]);
  });

  it('TR-PLT-03 : le contrôle signale une clé manquante, une valeur vide et une variable absente', () => {
    const problems = compare(
      { 'a.b': 'x', 'a.c': 'bonjour {name}', 'a.d': 'z' },
      { 'a.b': '', 'a.c': 'hello', 'a.e': 'y' },
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'EN manquant : a.d',
        'FR manquant : a.e',
        'EN vide : a.b',
        'Variables différentes : a.c',
      ]),
    );
  });
});

describe('pickLocale', () => {
  it('prend le cookie en premier', () => {
    expect(pickLocale('en', 'fr-FR,fr;q=0.9')).toBe('en');
  });
  it('sinon la langue du navigateur', () => {
    expect(pickLocale(undefined, 'en-GB,en;q=0.8')).toBe('en');
  });
  it('sinon le français, y compris pour une langue non gérée ou un cookie invalide', () => {
    expect(pickLocale('de', 'es-ES')).toBe('fr');
    expect(pickLocale(undefined, null)).toBe('fr');
  });
});
