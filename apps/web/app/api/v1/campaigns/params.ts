// Paramètres d'adresse des routes « campagnes » : UUID, sinon 400 (jamais envoyés tels quels à la base).
import { isUuid } from '@pubeka/shared';
import { fieldError } from '../../../../server/http/problem';

export function campaignIdParam(params: Record<string, string>): string {
  const value = params.campaignId ?? '';
  if (!isUuid(value)) throw fieldError('campaignId', 'invalid_format', 'UUID attendu');
  return value;
}

/** Numéro de version d'une proposition (entier ≥ 1), sinon 400. */
export function proposalVersionParam(params: Record<string, string>): number {
  const raw = params.version ?? '';
  const value = Number(raw);
  if (!/^[1-9][0-9]{0,6}$/.test(raw) || !Number.isSafeInteger(value)) {
    throw fieldError('version', 'invalid_format', 'Entier positif attendu');
  }
  return value;
}

/** `Idempotency-Key` d'une route qui dépense : UUID, obligatoire (API_SPEC §7). */
export function idempotencyKeyOf(headers: Headers): string {
  const key = headers.get('idempotency-key') ?? '';
  if (!isUuid(key)) {
    throw fieldError(
      'Idempotency-Key',
      key === '' ? 'required' : 'invalid_format',
      'UUID v4 attendu',
    );
  }
  return key;
}
