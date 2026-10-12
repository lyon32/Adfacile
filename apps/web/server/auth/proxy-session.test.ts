import { describe, expect, it } from 'vitest';
import { decideAccess } from './proxy-session';

describe('decideAccess (proxy.ts)', () => {
  it('écrans d’accès ouverts sans session', () => {
    for (const p of [
      '/connexion',
      '/inscription',
      '/mot-de-passe-oublie',
      '/auth/callback',
      '/auth/sign-in',
    ]) {
      expect(decideAccess(p, '', false)).toEqual({ kind: 'allow' });
    }
  });

  it('EC-AUTH-02 : sans session, le tableau de bord renvoie à la connexion', () => {
    expect(decideAccess('/', '', false)).toEqual({ kind: 'redirect', to: '/connexion' });
  });

  it('EC-AUTH-01 : session expirée au milieu d’un écran → retour à ce même écran après connexion', () => {
    expect(decideAccess('/campagnes/nouvelle', '?etape=questions', false)).toEqual({
      kind: 'redirect',
      to: '/connexion?retour=%2Fcampagnes%2Fnouvelle%3Fetape%3Dquestions',
    });
  });

  it('utilisateur connecté : connexion et inscription renvoient au tableau de bord', () => {
    expect(decideAccess('/connexion', '', true)).toEqual({ kind: 'redirect', to: '/' });
    expect(decideAccess('/inscription', '', true)).toEqual({ kind: 'redirect', to: '/' });
    expect(decideAccess('/campagnes', '', true)).toEqual({ kind: 'allow' });
    expect(decideAccess('/mot-de-passe-oublie', '', true)).toEqual({ kind: 'allow' });
  });

  it('nouveau mot de passe : exige la session ouverte par le lien', () => {
    expect(decideAccess('/mot-de-passe-oublie/nouveau', '', true)).toEqual({ kind: 'allow' });
    expect(decideAccess('/mot-de-passe-oublie/nouveau', '', false)).toEqual({
      kind: 'redirect',
      to: '/connexion?erreur=lien_expire',
    });
  });
});
