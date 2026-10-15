// Paramètre d'adresse de l'analyse : UUID, sinon 400 (jamais envoyé tel quel à la base).
import { isUuid } from '@pubeka/shared';
import { fieldError } from '../../../../server/http/problem';

export function analysisIdParam(params: Record<string, string>): string {
  const value = params.analysisId ?? '';
  if (!isUuid(value)) throw fieldError('analysisId', 'invalid_format', 'UUID attendu');
  return value;
}
