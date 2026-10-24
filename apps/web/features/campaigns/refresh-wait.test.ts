// Attente d'une actualisation demandée (TR-PLA-06) : on attend la copie, mais JAMAIS indéfiniment. L'attente s'arrête quand la copie est
// arrivée, quand elle a échoué (`sync_error`), ou après un délai maximum. Les dates se comparent comme des instants (Date.parse), jamais
// comme du texte : « …:00Z » et « …:00.000Z » désignent le même instant mais ne se comparent pas bien en chaînes.
import { describe, expect, it } from 'vitest';
import { isRefreshPending, REFRESH_WAIT_MAX_MS } from './api';

const REQUESTED = '2026-10-24T09:30:00Z';
const at = (offsetMs: number): number => Date.parse(REQUESTED) + offsetMs;
const stats = (over: { synced_at?: string | null; sync_error?: string | null } = {}) => ({
  synced_at: '2026-10-24T08:00:00Z',
  sync_error: null,
  ...over,
});

describe('isRefreshPending', () => {
  it('aucune demande : jamais en attente', () => {
    expect(isRefreshPending(null, stats(), at(0))).toBe(false);
  });

  it('copie pas encore arrivée : en attente', () => {
    expect(isRefreshPending(REQUESTED, stats(), at(5_000))).toBe(true);
    expect(isRefreshPending(REQUESTED, stats({ synced_at: null }), at(5_000))).toBe(true);
    expect(isRefreshPending(REQUESTED, undefined, at(5_000))).toBe(true);
  });

  it('copie arrivée (même instant ou plus tard) : plus en attente', () => {
    expect(
      isRefreshPending(REQUESTED, stats({ synced_at: '2026-10-24T09:30:00Z' }), at(5_000)),
    ).toBe(false);
    expect(
      isRefreshPending(REQUESTED, stats({ synced_at: '2026-10-24T09:31:00Z' }), at(5_000)),
    ).toBe(false);
  });

  it('comparaison par instants : « 09:30:00.000Z » EST l’instant demandé « 09:30:00Z » (une comparaison de chaînes dirait le contraire)', () => {
    expect('2026-10-24T09:30:00.000Z' < '2026-10-24T09:30:00Z').toBe(true);
    expect(
      isRefreshPending(REQUESTED, stats({ synced_at: '2026-10-24T09:30:00.000Z' }), at(5_000)),
    ).toBe(false);
  });

  it.each(['rate_limited', 'fx_not_available', 'meta_error', 'token_expired'])(
    'la copie a échoué (%s) : plus en attente, même si synced_at n’a pas bougé',
    (error) => {
      expect(isRefreshPending(REQUESTED, stats({ sync_error: error }), at(5_000))).toBe(false);
    },
  );

  it('délai maximum : plus en attente après 2 minutes, même sans réponse ni erreur', () => {
    expect(REFRESH_WAIT_MAX_MS).toBe(120_000);
    expect(isRefreshPending(REQUESTED, stats(), at(REFRESH_WAIT_MAX_MS - 1))).toBe(true);
    expect(isRefreshPending(REQUESTED, stats(), at(REFRESH_WAIT_MAX_MS))).toBe(false);
  });

  it('une date illisible ne bloque jamais l’écran', () => {
    expect(isRefreshPending('pas une date', stats(), at(0))).toBe(false);
  });
});
