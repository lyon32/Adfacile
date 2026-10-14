// Paramètres d'adresse de la section Meta : UUID, sinon 400 (jamais envoyés tels quels à la base).
import { isUuid } from '@pubeka/shared';
import { fieldError } from '../../../../server/http/problem';

function uuidParam(params: Record<string, string>, name: string): string {
  const value = params[name] ?? '';
  if (!isUuid(value)) throw fieldError(name, 'invalid_format', 'UUID attendu');
  return value;
}

export const connectionIdParam = (params: Record<string, string>): string =>
  uuidParam(params, 'connectionId');
export const pageIdParam = (params: Record<string, string>): string => uuidParam(params, 'pageId');
export const adAccountIdParam = (params: Record<string, string>): string =>
  uuidParam(params, 'adAccountId');
