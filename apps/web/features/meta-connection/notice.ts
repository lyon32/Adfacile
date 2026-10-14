// Résultat du retour de Facebook, lu dans l'adresse (`?meta=` et `?reason=`) par les pages serveur
// (APPFLOW §6.1). Fichier sans 'use client' : appelé côté serveur.
export type ConnectNotice = 'connected' | 'denied' | 'state' | 'forbidden' | 'meta';

const NOTICES: readonly ConnectNotice[] = ['connected', 'denied', 'state', 'forbidden', 'meta'];

/** Lit `?meta=` et `?reason=` de l'adresse de retour (APPFLOW §6.1). */
export function parseNotice(
  meta: string | undefined,
  reason: string | undefined,
): ConnectNotice | null {
  if (meta === 'connected') return 'connected';
  if (meta !== 'error') return null;
  return NOTICES.find((n) => n === reason && n !== 'connected') ?? 'meta';
}
