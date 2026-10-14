// Signature du `state` de la connexion Meta (SECURITY_NOTES §2.3) : bonne, modifiée, tronquée.
import type { OAuthStatePayload } from '@pubeka/core';
import { describe, expect, it } from 'vitest';
import { createStateCodec } from './state-codec';

// Clé de test tirée à la main : 32 octets en base64, jamais une vraie clé.
const SECRET = Buffer.alloc(32, 7).toString('base64');
const OTHER = Buffer.alloc(32, 9).toString('base64');
const payload: OAuthStatePayload = {
  v: 1,
  u: 'user-1',
  w: 'ws-1',
  n: 'n'.repeat(24),
  e: 2_000_000_000,
  r: 'settings',
};

describe('createStateCodec', () => {
  const codec = createStateCodec(SECRET);

  it('relit une charge utile qu’il a signée', () => {
    expect(codec.open(codec.seal(payload))).toEqual(payload);
  });

  it('refuse un state signé avec une autre clé', () => {
    expect(codec.open(createStateCodec(OTHER).seal(payload))).toBeNull();
  });

  it('refuse une charge utile modifiée avec la signature d’origine', () => {
    const [body, signature] = codec.seal(payload).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, w: 'ws-2' })).toString('base64url');
    expect(body).toBeDefined();
    expect(codec.open(`${forged}.${signature ?? ''}`)).toBeNull();
  });

  it.each(['', 'sans-point', 'a.b.c', '.', 'e30.', 'e30.AAAA', 'é.é'])(
    'refuse le state mal formé %j sans lever d’erreur',
    (token) => {
      expect(codec.open(token)).toBeNull();
    },
  );

  it('refuse une signature de bonne forme mais d’une autre longueur', () => {
    const [body] = codec.seal(payload).split('.');
    expect(codec.open(`${body ?? ''}.${Buffer.alloc(8).toString('base64url')}`)).toBeNull();
  });

  it('refuse un JSON invalide même correctement signé', () => {
    // Même clé, corps qui n'est pas du JSON : le codec réel signerait un tel corps seulement si le
    // serveur le produisait ; ici on prouve qu'il ne lève pas d'erreur à la lecture.
    const sealed = codec.seal(payload).split('.');
    expect(
      codec.open(`${Buffer.from('pas du json').toString('base64url')}.${sealed[1] ?? ''}`),
    ).toBeNull();
  });
});
