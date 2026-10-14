// Signature du `state` de la connexion Meta : HMAC-SHA256 avec APP_SIGNING_SECRET, comparaison en
// temps constant (SECURITY_NOTES §2.3). Séparé de meta-services pour être testé sans `server-only`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OAuthStatePayload, StateCodec } from '@pubeka/core';

function base64url(data: Buffer | string): string {
  return Buffer.from(data).toString('base64url');
}

/** `state` = base64url(JSON) + « . » + base64url(HMAC-SHA256 du premier morceau). */
export function createStateCodec(signingSecretBase64: string): StateCodec {
  const key = Buffer.from(signingSecretBase64, 'base64');
  const mac = (body: string): Buffer => createHmac('sha256', key).update(body, 'utf8').digest();
  return {
    seal(payload: OAuthStatePayload): string {
      const body = base64url(JSON.stringify(payload));
      return `${body}.${base64url(mac(body))}`;
    },
    open(token: string): unknown {
      const parts = token.split('.');
      const [body, signature] = parts;
      if (parts.length !== 2 || body === undefined || signature === undefined) return null;
      const expected = mac(body);
      const given = Buffer.from(signature, 'base64url');
      // Longueurs différentes : timingSafeEqual lève une erreur, la signature est fausse.
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
      } catch {
        return null;
      }
    },
  };
}
