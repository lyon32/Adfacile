// Curseurs de pagination signés (API_SPEC §8 : « opaque, encodé et signé » ; ENV_SETUP : `APP_SIGNING_SECRET` « signe les curseurs de
// pagination et le paramètre `state` de la connexion Meta »). Même mécanisme que `state-codec.ts` : HMAC-SHA256 avec la clé de
// signature de l'application, comparaison en temps constant. Aucune nouvelle variable d'environnement.
//
// Séparation des usages : le texte signé est préfixé d'une étiquette (« list-cursor: ») qui n'existe pas dans le codec du `state` de
// connexion : un `state` signé avec la même clé ne s'ouvre jamais comme curseur, ni l'inverse. Séparé du service pour être testé sans
// `server-only`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ListCursorCodec, ListCursorKey } from '@pubeka/core';

const LABEL = 'list-cursor:';

function base64url(data: Buffer | string): string {
  return Buffer.from(data).toString('base64url');
}

function isKey(value: unknown): value is ListCursorKey {
  return (
    typeof value === 'object' &&
    value !== null &&
    'created_at' in value &&
    'id' in value &&
    typeof value.created_at === 'string' &&
    typeof value.id === 'string'
  );
}

/** Curseur = base64url(JSON {created_at, id}) + « . » + base64url(HMAC-SHA256 de « list-cursor: » + premier morceau). */
export function createCursorCodec(signingSecretBase64: string): ListCursorCodec {
  const key = Buffer.from(signingSecretBase64, 'base64');
  const mac = (body: string): Buffer =>
    createHmac('sha256', key).update(`${LABEL}${body}`, 'utf8').digest();
  return {
    seal(cursorKey: ListCursorKey): string {
      const body = base64url(
        JSON.stringify({ created_at: cursorKey.created_at, id: cursorKey.id }),
      );
      return `${body}.${base64url(mac(body))}`;
    },
    open(token: string): ListCursorKey | null {
      const parts = token.split('.');
      const [body, signature] = parts;
      if (parts.length !== 2 || body === undefined || signature === undefined || body === '') {
        return null;
      }
      const expected = mac(body);
      const given = Buffer.from(signature, 'base64url');
      // Longueurs différentes : timingSafeEqual lève une erreur, la signature est fausse.
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        return isKey(parsed) ? { created_at: parsed.created_at, id: parsed.id } : null;
      } catch {
        return null;
      }
    },
  };
}
