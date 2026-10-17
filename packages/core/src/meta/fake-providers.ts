// Faux fournisseurs (ENV_SETUP §1.1) : `PUBEKA_FAKE_PROVIDERS` vaut `all`, ou une liste qui contient le fournisseur. Module feuille
// (aucune dépendance) : partagé par la fabrique du connecteur et par l'interrupteur de publication réelle sans import circulaire.
import type { Env } from '@pubeka/shared';

export function usesFakeMeta(env: Pick<Env, 'PUBEKA_FAKE_PROVIDERS'>): boolean {
  const list = env.PUBEKA_FAKE_PROVIDERS;
  if (list === undefined) return false;
  return list === 'all' || list.split(',').some((p) => p.trim() === 'meta');
}
