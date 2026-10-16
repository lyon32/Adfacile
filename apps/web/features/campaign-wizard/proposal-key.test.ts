// @vitest-environment happy-dom
// Clé d'idempotence gardée par campagne : relue après rechargement, jamais crue si elle est altérée, jamais bloquante.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPendingKey, loadPendingKey, savePendingKey } from './proposal-key';

const KEY = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('clé d’idempotence par campagne', () => {
  it('écrite puis relue pour la même campagne, pas pour une autre', () => {
    savePendingKey('c1', KEY);
    expect(loadPendingKey('c1')).toBe(KEY);
    expect(loadPendingKey('c2')).toBeNull();
  });
  it('effacée', () => {
    savePendingKey('c1', KEY);
    clearPendingKey('c1');
    expect(loadPendingKey('c1')).toBeNull();
  });
  it('valeur altérée (pas un UUID) : ignorée', () => {
    window.sessionStorage.setItem('pubeka:proposal-key:c1', 'pas-un-uuid');
    expect(loadPendingKey('c1')).toBeNull();
  });
  it('stockage refusé : aucune erreur, aucune clé', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    expect(() => {
      savePendingKey('c1', KEY);
      clearPendingKey('c1');
    }).not.toThrow();
    expect(loadPendingKey('c1')).toBeNull();
  });
});
