import { describe, expect, it } from 'vitest';
import { debutDeJournee, decalageMinutes, finDeJournee } from './ad-account-time';

// Tests portés de backend/src/utils/adAccountTime.test.js (TR-PLA-02).

// Le compte publicitaire de production est en America/Los_Angeles alors que le
// serveur tourne en UTC : c'est précisément l'écart qui a décalé les dates.
const LA = 'America/Los_Angeles';

describe('decalageMinutes', () => {
  it("suit l'heure d'été", () => {
    expect(decalageMinutes(new Date('2026-08-15T12:00:00Z'), LA)).toBe(-420); // UTC-7
    expect(decalageMinutes(new Date('2026-01-15T12:00:00Z'), LA)).toBe(-480); // UTC-8
  });

  it('renvoie zéro en UTC', () => {
    expect(decalageMinutes(new Date('2026-08-15T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('finDeJournee', () => {
  it("garde le jour choisi au lieu de reculer d'un jour", () => {
    // Bug d'origine : end_date « 2026-08-15 » envoyé en 2026-08-15T00:00:00Z
    // que Meta affichait « 2026-08-14T17:00:00-0700 ».
    const resultat = finDeJournee('2026-08-15', LA);

    expect(resultat).toBe('2026-08-15T23:59:59-0700');
    expect(resultat).not.toMatch(/^2026-08-14/);
  });

  it('couvre la journée entière, pas seulement son premier instant', () => {
    expect(finDeJournee('2026-08-15', LA)).toMatch(/T23:59:59/);
  });

  it('accepte un objet Date comme une chaîne', () => {
    expect(finDeJournee(new Date('2026-08-15T00:00:00Z'), LA)).toBe(finDeJournee('2026-08-15', LA));
  });

  it("applique le décalage d'hiver hors heure d'été", () => {
    expect(finDeJournee('2026-01-15', LA)).toBe('2026-01-15T23:59:59-0800');
  });

  it('fonctionne pour un fuseau en avance sur UTC', () => {
    expect(finDeJournee('2026-08-15', 'Africa/Douala')).toBe('2026-08-15T23:59:59+0100');
  });

  it('renvoie null sur une date absente', () => {
    expect(finDeJournee(null, LA)).toBeNull();
    expect(finDeJournee('', LA)).toBeNull();
  });
});

describe('debutDeJournee', () => {
  it('démarre au début du jour choisi, dans le fuseau du compte', () => {
    const maintenant = new Date('2026-08-01T12:00:00Z');
    expect(debutDeJournee('2026-08-15', LA, maintenant)).toBe('2026-08-15T00:00:00-0700');
  });

  it('ramène à maintenant une date déjà passée, refusée par Meta', () => {
    const maintenant = new Date('2026-08-20T12:00:00Z');
    expect(debutDeJournee('2026-08-15', LA, maintenant)).toBe(maintenant.toISOString());
  });

  it('retombe sur maintenant si la date est illisible', () => {
    const maintenant = new Date('2026-08-20T12:00:00Z');
    expect(debutDeJournee(undefined, LA, maintenant)).toBe(maintenant.toISOString());
  });
});

describe('cohérence début / fin', () => {
  it("laisse une durée strictement positive sur une campagne d'un seul jour", () => {
    const maintenant = new Date('2026-08-01T12:00:00Z');
    const debut = new Date(debutDeJournee('2026-08-15', LA, maintenant));
    const fin = new Date(finDeJournee('2026-08-15', LA) ?? '');

    expect(fin.getTime()).toBeGreaterThan(debut.getTime());
    // Une journée pleine, à une seconde près.
    expect((fin.getTime() - debut.getTime()) / 1000).toBe(86399);
  });
});
