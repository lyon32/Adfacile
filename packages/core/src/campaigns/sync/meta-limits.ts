// Limites de débit de Meta (EC-META-10). Codes d'erreur relevés dans la documentation « Marketing API Rate Limiting »
// (https://developers.facebook.com/docs/marketing-api/overview/rate-limiting, mise à jour le 19/08/2026) :
//  - niveau APPLICATION : 4 (« Application request limit reached » / « too many calls from this app ») ;
//  - niveau COMPTE PUBLICITAIRE : 17 (« User request limit reached »), 613 (« too many calls from this ad-account »),
//    80000, 80003, 80004, 80014 (« too many calls from this ad-account »).
// Que faire : arrêter les appels (jamais insister), garder les dernières valeurs lues avec leur heure de mise à jour, laisser
// la passe suivante reprendre. L'attente est donc l'intervalle des tâches planifiées, bien plus long que le délai de blocage
// documenté (60 s avec accès complet, 300 s en développement).
import { AppError } from '@pubeka/contracts';
import { MetaGraphError, MetaOperationError } from '@pubeka/platforms';

const APP_LEVEL = new Set([4]);
const ACCOUNT_LEVEL = new Set([17, 613, 80000, 80003, 80004, 80014]);

export type RateLimitScope = 'app' | 'ad_account';

function graphCause(error: unknown): MetaGraphError | null {
  if (error instanceof MetaGraphError) return error;
  if (error instanceof MetaOperationError) return graphCause(error.cause);
  if (error instanceof AppError) return graphCause(error.cause);
  return null;
}

/** `null` si l'erreur n'est pas une limitation de débit ; sinon le niveau touché. */
export function metaRateLimitScope(error: unknown): RateLimitScope | null {
  const code = graphCause(error)?.fbError.code;
  if (code === undefined) return null;
  if (APP_LEVEL.has(code)) return 'app';
  return ACCOUNT_LEVEL.has(code) ? 'ad_account' : null;
}
