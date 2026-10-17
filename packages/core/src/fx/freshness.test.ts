// Fraîcheur d'un taux : plus vieux que 48 h, il n'est plus utilisé (l'écran n'affiche alors que le dollar).
import { describe, expect, it } from 'vitest';
import { FX_MAX_AGE_MS, isFxFresh } from './freshness';

const NOW = new Date('2026-10-17T12:00:00Z');
const hoursAgo = (h: number, extraMs = 0) =>
  new Date(NOW.getTime() - h * 3_600_000 - extraMs).toISOString();

describe('isFxFresh', () => {
  it('le seuil est de 48 heures', () => {
    expect(FX_MAX_AGE_MS).toBe(48 * 60 * 60 * 1000);
  });
  it('la date de PUBLICATION du fournisseur prime sur la date de lecture', () => {
    // lu il y a 1 h mais publié il y a 49 h : périmé
    expect(isFxFresh({ provider_updated_at: hoursAgo(49), fetched_at: hoursAgo(1) }, NOW)).toBe(
      false,
    );
    // lu il y a 60 h mais publié il y a 10 h : frais (ne peut pas arriver, mais la règle est claire)
    expect(isFxFresh({ provider_updated_at: hoursAgo(10), fetched_at: hoursAgo(60) }, NOW)).toBe(
      true,
    );
  });
  it('sans date du fournisseur (taux saisi à la main) : la date d’écriture', () => {
    expect(isFxFresh({ provider_updated_at: null, fetched_at: hoursAgo(47) }, NOW)).toBe(true);
    expect(isFxFresh({ provider_updated_at: null, fetched_at: hoursAgo(49) }, NOW)).toBe(false);
  });
  it('exactement 48 h : encore utilisable; 1 ms de plus : périmé', () => {
    expect(isFxFresh({ provider_updated_at: hoursAgo(48), fetched_at: hoursAgo(48) }, NOW)).toBe(
      true,
    );
    expect(isFxFresh({ provider_updated_at: hoursAgo(48, 1), fetched_at: hoursAgo(48) }, NOW)).toBe(
      false,
    );
  });
  it('une date illisible est périmée, jamais fraîche', () => {
    expect(isFxFresh({ provider_updated_at: null, fetched_at: 'pas une date' }, NOW)).toBe(false);
  });
  it('une date dans le futur au-delà de 1 h (horloge déréglée) est refusée; dans la tolérance, acceptée', () => {
    const future = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
    expect(isFxFresh({ provider_updated_at: future(30), fetched_at: future(30) }, NOW)).toBe(true);
    expect(isFxFresh({ provider_updated_at: future(61), fetched_at: future(61) }, NOW)).toBe(false);
  });
});
