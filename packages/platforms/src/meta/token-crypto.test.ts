import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import {
  activeEncryptionKey,
  decryptToken,
  encryptToken,
  parseEncryptionKeys,
  rotateToken,
  sealedKeyId,
} from './token-crypto';

const keyBytes = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);
const K1 = { id: 'k1', bytes: keyBytes(1) };
const K2 = { id: 'k2', bytes: keyBytes(2) };
const JETON = 'EAAB-jeton-de-test-0123456789';

describe('token-crypto — chiffrement AES-256-GCM (LLD §6.13)', () => {
  it('rend le jeton d’origine après chiffrement puis déchiffrement', () => {
    const sealed = encryptToken(JETON, K1);
    expect(decryptToken(sealed, { k1: K1.bytes })).toBe(JETON);
  });

  it('produit le format v1.<keyId>.<iv>.<chiffré>.<étiquette> sans le jeton en clair', () => {
    const parts = encryptToken(JETON, K1).split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe('k1');
    expect(Buffer.from(parts[2] ?? '', 'base64url')).toHaveLength(12);
    expect(Buffer.from(parts[4] ?? '', 'base64url')).toHaveLength(16);
    expect(encryptToken(JETON, K1)).not.toContain(JETON);
  });

  it('utilise un IV différent à chaque chiffrement', () => {
    expect(encryptToken(JETON, K1)).not.toBe(encryptToken(JETON, K1));
  });

  it('refuse une clé qui ne fait pas 32 octets', () => {
    expect(() => encryptToken(JETON, { id: 'k1', bytes: new Uint8Array(16) })).toThrow(AppError);
  });

  it('refuse un identifiant de clé contenant un point', () => {
    expect(() => encryptToken(JETON, { id: 'a.b', bytes: keyBytes(1) })).toThrow(AppError);
  });
});

describe('token-crypto — rotation des clés (TR-PLA-03, ARCHITECTURE §6)', () => {
  it('déchiffre avec l’ancienne clé tant qu’elle reste dans la liste, après passage à la nouvelle', () => {
    const ancien = encryptToken(JETON, K1);
    const nouveau = encryptToken(JETON, K2);
    const keys = { k1: K1.bytes, k2: K2.bytes };
    expect(decryptToken(ancien, keys)).toBe(JETON);
    expect(decryptToken(nouveau, keys)).toBe(JETON);
  });

  it('rotateToken rechiffre un jeton de l’ancienne clé avec la clé active', () => {
    const ancien = encryptToken(JETON, K1);
    const keys = { k1: K1.bytes, k2: K2.bytes };
    const refait = rotateToken(ancien, keys, K2);
    expect(refait).not.toBeNull();
    expect(sealedKeyId(refait ?? '')).toBe('k2');
    expect(decryptToken(refait ?? '', { k2: K2.bytes })).toBe(JETON);
  });

  it('rotateToken ne fait rien si le jeton est déjà chiffré avec la clé active', () => {
    const deja = encryptToken(JETON, K2);
    expect(rotateToken(deja, { k2: K2.bytes }, K2)).toBeNull();
  });

  it('échoue quand la clé d’origine a été retirée de la liste', () => {
    const ancien = encryptToken(JETON, K1);
    expect(() => decryptToken(ancien, { k2: K2.bytes })).toThrow(AppError);
  });

  it('échoue avec une autre clé portant le même identifiant', () => {
    const sealed = encryptToken(JETON, K1);
    expect(() => decryptToken(sealed, { k1: keyBytes(9) })).toThrow(AppError);
  });
});

describe('token-crypto — intégrité', () => {
  const swap = (sealed: string, index: number, value: string): string => {
    const parts = sealed.split('.');
    parts[index] = value;
    return parts.join('.');
  };

  it('refuse un texte chiffré modifié', () => {
    const sealed = encryptToken(JETON, K1);
    const body = Buffer.from(sealed.split('.')[3] ?? '', 'base64url');
    body[0] = (body[0] ?? 0) ^ 1;
    expect(() =>
      decryptToken(swap(sealed, 3, body.toString('base64url')), { k1: K1.bytes }),
    ).toThrow(AppError);
  });

  it('refuse une étiquette modifiée', () => {
    const sealed = encryptToken(JETON, K1);
    expect(() =>
      decryptToken(swap(sealed, 4, Buffer.alloc(16).toString('base64url')), { k1: K1.bytes }),
    ).toThrow(AppError);
  });

  it('refuse un identifiant de clé réécrit, même si l’autre clé est connue (données associées)', () => {
    const sealed = encryptToken(JETON, K1);
    expect(() => decryptToken(swap(sealed, 1, 'k2'), { k1: K1.bytes, k2: K1.bytes })).toThrow(
      AppError,
    );
  });

  it.each(['', 'abc', 'v2.k1.a.b.c', 'v1.k1.a.b', 'v1.k1.AAAA.AAAA.AAAA'])(
    'refuse le format invalide « %s »',
    (bad) => {
      expect(() => decryptToken(bad, { k1: K1.bytes })).toThrow(AppError);
    },
  );

  it('n’écrit jamais le jeton dans le message de l’erreur', () => {
    const sealed = encryptToken(JETON, K1);
    try {
      decryptToken(sealed, { k2: K2.bytes });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain(JETON);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('internal_error');
    }
  });

  it('sealedKeyId renvoie null pour un format inconnu', () => {
    expect(sealedKeyId('nimporte quoi')).toBeNull();
  });
});

describe('token-crypto — lecture de TOKEN_ENCRYPTION_KEYS', () => {
  const b64 = (fill: number): string => Buffer.alloc(32, fill).toString('base64');

  it('lit un objet JSON { identifiant: clé en base64 }', () => {
    const keys = parseEncryptionKeys(JSON.stringify({ k1: b64(1), k2: b64(2) }));
    expect(Object.keys(keys)).toEqual(['k1', 'k2']);
    expect(keys.k1).toEqual(keyBytes(1));
  });

  it('refuse un JSON invalide, une clé trop courte et un tableau', () => {
    expect(() => parseEncryptionKeys('pas du json')).toThrow(AppError);
    expect(() => parseEncryptionKeys(JSON.stringify({ k1: 'AAAA' }))).toThrow(AppError);
    expect(() => parseEncryptionKeys(JSON.stringify({ k1: 12 }))).toThrow(AppError);
    expect(() => parseEncryptionKeys('[]')).toThrow(AppError);
  });

  it('activeEncryptionKey renvoie la clé active, ou échoue si elle manque', () => {
    const keys = { k1: keyBytes(1) };
    expect(activeEncryptionKey(keys, 'k1').id).toBe('k1');
    expect(() => activeEncryptionKey(keys, 'k9')).toThrow(AppError);
  });
});
