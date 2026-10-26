'use client';
// L'espace actif est-il modifiable (SEUL l'état « actif » écrit) ? Lu dans la session : l'écran désactive les commandes d'écriture
// avec une explication (APPFLOW §19.2) ; chaque route revérifie (`writable`). Hors session (tests isolés), on ne bloque rien.
import { useContext } from 'react';
import { SessionContext } from './session-context';
import { isWritableStatus } from './workspace-access';

export function useWorkspaceWritable(): boolean {
  const session = useContext(SessionContext);
  const workspace = session?.workspace ?? null;
  return workspace === null ? true : isWritableStatus(workspace.status);
}

/** L'abonnement est-il à renouveler (grâce) plutôt qu'une lecture seule décidée par l'administration ? Choisit le bon message. */
export function useRenewalMessage(): boolean {
  const session = useContext(SessionContext);
  return session?.workspace?.status === 'grace';
}
