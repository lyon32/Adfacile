// Règles du loader « Saisie » (TR-PRF-04) : complet une seule fois par session de navigation,
// version courte seulement si un chargement dépasse 300 ms.

export const FULL_LOADER_MS = 3000;
/** Avec « réduire les animations », le logo reste fixe et disparaît plus vite (TR-PRF-09). */
export const FULL_LOADER_REDUCED_MS = 800;
export const SHORT_LOADER_DELAY_MS = 300;
export const FULL_LOADER_SESSION_KEY = 'pubeka.loader.full-seen';

export type SessionFlagStore = Pick<Storage, 'getItem' | 'setItem'>;

let seenWithoutStorage = false;

/**
 * Vrai la première fois dans la session, puis faux. Marque le loader comme vu.
 * Sans stockage utilisable (navigation privée stricte), retient l'information en mémoire.
 */
export function claimFullLoader(store: SessionFlagStore | null): boolean {
  try {
    if (store === null) throw new Error('no storage');
    if (store.getItem(FULL_LOADER_SESSION_KEY) !== null) return false;
    store.setItem(FULL_LOADER_SESSION_KEY, '1');
    return true;
  } catch {
    if (seenWithoutStorage) return false;
    seenWithoutStorage = true;
    return true;
  }
}

/** Pour les tests : oublie l'état mémorisé hors stockage. */
export function resetLoaderMemory(): void {
  seenWithoutStorage = false;
}

export function fullLoaderDuration(reducedMotion: boolean): number {
  return reducedMotion ? FULL_LOADER_REDUCED_MS : FULL_LOADER_MS;
}
