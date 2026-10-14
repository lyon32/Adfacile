// Chiffrement des jetons Meta au repos (LLD §6.13, ARCHITECTURE §6).
// AES-256-GCM, IV aléatoire de 12 octets, étiquette de 16 octets.
// Format : "v1.<keyId>.<iv>.<texte chiffré>.<étiquette>", chaque partie en base64url.
// La version et l'identifiant de clé sont authentifiés (données associées) : les modifier
// fait échouer le déchiffrement. Documentation : https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '@pubeka/contracts';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface EncryptionKey {
  id: string;
  bytes: Uint8Array;
}

function assertKey(key: EncryptionKey): void {
  if (!KEY_ID_PATTERN.test(key.id)) {
    throw new AppError('internal_error', { cause: new Error('identifiant de clé invalide') });
  }
  if (key.bytes.length !== KEY_BYTES) {
    throw new AppError('internal_error', { cause: new Error('une clé AES-256 fait 32 octets') });
  }
}

/** Chiffre un jeton ; `key` est la clé active. */
export function encryptToken(plain: string, key: EncryptionKey): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.bytes, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(`${VERSION}.${key.id}`, 'utf8'));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    key.id,
    iv.toString('base64url'),
    body.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

interface SealedParts {
  keyId: string;
  iv: Buffer;
  body: Buffer;
  tag: Buffer;
}

function parseSealed(sealed: string): SealedParts {
  const parts = sealed.split('.');
  const [version, keyId, iv, body, tag] = parts;
  if (
    parts.length !== 5 ||
    version !== VERSION ||
    keyId === undefined ||
    iv === undefined ||
    body === undefined ||
    tag === undefined ||
    !KEY_ID_PATTERN.test(keyId)
  ) {
    throw new Error('format de jeton chiffré inconnu');
  }
  const parsed = {
    keyId,
    iv: Buffer.from(iv, 'base64url'),
    body: Buffer.from(body, 'base64url'),
    tag: Buffer.from(tag, 'base64url'),
  };
  if (parsed.iv.length !== IV_BYTES || parsed.tag.length !== TAG_BYTES) {
    throw new Error('IV ou étiquette de longueur invalide');
  }
  return parsed;
}

/** Déchiffre un jeton ; la clé est choisie par son identifiant (rotation possible). */
export function decryptToken(sealed: string, keys: Record<string, Uint8Array>): string {
  try {
    const { keyId, iv, body, tag } = parseSealed(sealed);
    const bytes = Object.hasOwn(keys, keyId) ? keys[keyId] : undefined;
    if (bytes === undefined) throw new Error(`clé inconnue : ${keyId}`);
    assertKey({ id: keyId, bytes });
    const decipher = createDecipheriv(ALGORITHM, bytes, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(`${VERSION}.${keyId}`, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch (cause) {
    // Jamais le jeton ni la raison précise vers le client : la cause part dans les journaux.
    throw new AppError('internal_error', { cause });
  }
}

/** Identifiant de la clé qui a chiffré ce jeton, ou null si le format est inconnu. */
export function sealedKeyId(sealed: string): string | null {
  try {
    return parseSealed(sealed).keyId;
  } catch {
    return null;
  }
}

/** Rechiffre avec la clé active si le jeton ne l'est pas déjà ; null si rien à faire (rotation). */
export function rotateToken(
  sealed: string,
  keys: Record<string, Uint8Array>,
  active: EncryptionKey,
): string | null {
  if (sealedKeyId(sealed) === active.id) return null;
  return encryptToken(decryptToken(sealed, keys), active);
}

/** Lit `TOKEN_ENCRYPTION_KEYS` : objet JSON `{ identifiant: clé de 32 octets en base64 }`. */
export function parseEncryptionKeys(json: string): Record<string, Uint8Array> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (cause) {
    throw new AppError('internal_error', { cause });
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('internal_error', {
      cause: new Error('TOKEN_ENCRYPTION_KEYS : objet attendu'),
    });
  }
  const keys: Record<string, Uint8Array> = {};
  for (const [id, value] of Object.entries(raw)) {
    const bytes = typeof value === 'string' ? Buffer.from(value, 'base64') : null;
    if (bytes?.length !== KEY_BYTES || !KEY_ID_PATTERN.test(id)) {
      throw new AppError('internal_error', {
        cause: new Error(
          `TOKEN_ENCRYPTION_KEYS : clé « ${id} » invalide (32 octets en base64 attendus)`,
        ),
      });
    }
    keys[id] = new Uint8Array(bytes);
  }
  return keys;
}

/** La clé active, à partir des clés lues et de `TOKEN_ENCRYPTION_ACTIVE_KEY_ID`. */
export function activeEncryptionKey(
  keys: Record<string, Uint8Array>,
  activeId: string,
): EncryptionKey {
  const bytes = Object.hasOwn(keys, activeId) ? keys[activeId] : undefined;
  if (bytes === undefined) {
    throw new AppError('internal_error', {
      cause: new Error('clé active absente de TOKEN_ENCRYPTION_KEYS'),
    });
  }
  return { id: activeId, bytes };
}
