// Curseurs de pagination signés (API_SPEC §8 : « opaque, encodé et signé »). Clé fabriquée à l'exécution : aucune valeur réelle dans
// le code ni dans les tests.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStateCodec } from '../../app/api/v1/meta/state-codec';
import { createCursorCodec } from './cursor-codec';

const secret = (): string => randomBytes(32).toString('base64');
const KEY = { created_at: '2026-10-05T10:00:00.000Z', id: '00000000-0000-4000-8000-0000000000a1' };

describe('createCursorCodec', () => {
  it('scelle puis rouvre la clé (created_at, id)', () => {
    const codec = createCursorCodec(secret());
    const token = codec.seal(KEY);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(codec.open(token)).toEqual(KEY);
  });

  it('un curseur modifié (corps ou signature) est refusé', () => {
    const codec = createCursorCodec(secret());
    const [body = '', signature = ''] = codec.seal(KEY).split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ ...KEY, created_at: '2020-01-01T00:00:00.000Z' }),
    ).toString('base64url');
    expect(codec.open(`${forgedBody}.${signature}`)).toBeNull();
    expect(codec.open(`${body}.${signature.slice(0, -2)}AA`)).toBeNull();
    expect(codec.open(`${body}.`)).toBeNull();
    expect(codec.open(body)).toBeNull();
    expect(codec.open('')).toBeNull();
    expect(codec.open('a.b.c')).toBeNull();
  });

  it('un curseur signé avec une AUTRE clé est refusé', () => {
    const token = createCursorCodec(secret()).seal(KEY);
    expect(createCursorCodec(secret()).open(token)).toBeNull();
  });

  it('séparation des usages : un `state` de connexion Meta signé avec la MÊME clé n’est pas un curseur, et inversement', () => {
    const shared = secret();
    const cursor = createCursorCodec(shared);
    const state = createStateCodec(shared);
    const stateToken = state.seal({
      v: 1,
      u: KEY.id,
      w: KEY.id,
      n: 'nonce-de-test',
      e: 4_000_000_000,
      r: 'settings',
    } as never);
    expect(cursor.open(stateToken)).toBeNull();
    expect(state.open(cursor.seal(KEY))).toBeNull();
  });

  it('une charge signée mais de mauvaise forme est refusée (jamais de valeur non validée)', () => {
    const key = secret();
    const codec = createCursorCodec(key);
    const forged = createCursorCodec(key).seal({ created_at: 5, id: null } as never);
    expect(codec.open(forged)).toBeNull();
  });
});
