'use client';
// L'espace actif est-il modifiable (actif ou en grâce) ? Lu dans la session : l'écran désactive les commandes d'écriture avec une
// explication (APPFLOW §19.2) ; chaque route revérifie (`writable`). Hors session (tests isolés), on ne bloque rien.
import { useContext } from 'react';
import { SessionContext } from './session-context';
import { isWritableStatus } from './workspace-access';

export function useWorkspaceWritable(): boolean {
  const session = useContext(SessionContext);
  const workspace = session?.workspace ?? null;
  return workspace === null ? true : isWritableStatus(workspace.status);
}
