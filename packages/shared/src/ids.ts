import { randomBytes, randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createUuid(): string {
  return randomUUID();
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Identifiant de requête (`req_` + 16 caractères Crockford), API_SPEC §3.1. */
export function createRequestId(): string {
  let out = '';
  for (const byte of randomBytes(16)) out += CROCKFORD.charAt(byte % 32);
  return `req_${out}`;
}

export function isRequestId(value: string): boolean {
  return /^req_[0-9A-HJKMNP-TV-Z]{16}$/.test(value);
}
