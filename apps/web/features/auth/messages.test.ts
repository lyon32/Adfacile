import { describe, expect, it } from 'vitest';
import { MESSAGES, pickLocale, translator } from './messages';

describe('textes FR / EN', () => {
  it('les deux langues ont exactement les mêmes clés, toutes non vides', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.fr).sort());
    for (const dict of Object.values(MESSAGES)) {
      for (const text of Object.values(dict)) expect(text.trim()).not.toBe('');
    }
  });

  it('remplace les variables', () => {
    expect(translator('fr')('auth.idle.body', { seconds: 42 })).toBe(
      'Tu vas être déconnecté dans 42 s pour ta sécurité.',
    );
    expect(translator('en')('auth.check_email.body')).toContain('{email}');
  });

  it('langue : cookie, puis navigateur, sinon français', () => {
    expect(pickLocale('en', 'fr-FR')).toBe('en');
    expect(pickLocale(undefined, 'en-US,en;q=0.9')).toBe('en');
    expect(pickLocale('de', 'de-DE')).toBe('fr');
    expect(pickLocale(undefined, null)).toBe('fr');
  });
});
