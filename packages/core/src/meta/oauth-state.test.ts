// Le `state` de la connexion Meta : forme, durée, usage unique (SECURITY_NOTES §2.3).
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import {
  OAUTH_STATE_TTL_S,
  consumeOAuthState,
  createOAuthState,
  readOAuthState,
  type OAuthStatePayload,
  type StateCodec,
} from './oauth-state';

/** Codec de test : JSON en clair, sans signature (la signature est testée côté web). */
const codec: StateCodec = {
  seal: (payload) => JSON.stringify(payload),
  open: (token) => {
    try {
      return JSON.parse(token) as unknown;
    } catch {
      return null;
    }
  },
};

const NOW = new Date('2026-10-14T10:00:00Z');
const NONCE = 'n'.repeat(24);
const make = (): string =>
  createOAuthState(codec, {
    userId: 'u1',
    workspaceId: 'w1',
    nonce: NONCE,
    returnTo: 'onboarding',
    now: NOW,
  });
const read = (token: string, at: Date = NOW) => readOAuthState(codec, token, at);

describe('createOAuthState / readOAuthState', () => {
  it('relit ce qui a été scellé : utilisateur, espace, écran de retour', () => {
    expect(read(make())).toEqual({
      v: 1,
      u: 'u1',
      w: 'w1',
      n: NONCE,
      e: Math.floor(NOW.getTime() / 1000) + OAUTH_STATE_TTL_S,
      r: 'onboarding',
    });
  });

  it('vaut 10 minutes : accepté à 9 min 59, refusé à 10 min', () => {
    const state = make();
    expect(read(state, new Date(NOW.getTime() + (OAUTH_STATE_TTL_S - 1) * 1000))).not.toBeNull();
    expect(read(state, new Date(NOW.getTime() + OAUTH_STATE_TTL_S * 1000))).toBeNull();
  });

  it.each<[string, Partial<Record<keyof OAuthStatePayload, unknown>>]>([
    ['version inconnue', { v: 2 }],
    ['utilisateur absent', { u: undefined }],
    ['espace absent', { w: 5 }],
    ['identifiant trop court', { n: 'court' }],
    ['expiration non numérique', { e: '9999999999' }],
    ['expiration infinie', { e: Number.POSITIVE_INFINITY }],
    ['écran de retour inconnu', { r: 'ailleurs' }],
  ])('refuse une charge utile mal formée : %s', (_title, patch) => {
    const payload = { ...(codec.open(make()) as object), ...patch };
    expect(read(JSON.stringify(payload))).toBeNull();
  });

  it.each(['n-importe-quoi', 'null', '[]', '"texte"', '42'])('refuse %s', (token) => {
    expect(read(token)).toBeNull();
  });
});

describe('consumeOAuthState', () => {
  it('premier usage accepté, rejeu refusé (registre des événements déjà vus)', async () => {
    const svc = new FakeClient().reply({ data: true, error: null }, { data: false, error: null });
    expect(await consumeOAuthState(svc.asService(), NONCE)).toBe(true);
    expect(await consumeOAuthState(svc.asService(), NONCE)).toBe(false);
    expect(svc.calls[0]?.target).toBe('rpc:record_webhook_event');
    expect(svc.calls[0]?.ops).toContainEqual([
      'args',
      { p_provider: 'meta_oauth_state', p_event_id: NONCE },
    ]);
  });
});
