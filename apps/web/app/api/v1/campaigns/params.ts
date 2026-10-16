// Paramètres d'adresse des routes « campagnes » : UUID, sinon 400 (jamais envoyés tels quels à la base).
import { isUuid } from '@pubeka/shared';
import { fieldError } from '../../../../server/http/problem';

export function campaignIdParam(params: Record<string, string>): string {
  const value = params.campaignId ?? '';
  if (!isUuid(value)) throw fieldError('campaignId', 'invalid_format', 'UUID attendu');
  return value;
}
