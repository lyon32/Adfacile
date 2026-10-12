// Déconnexion pour inactivité (TR-SEC-13, APPFLOW §4.2 bis, LLD §7.5) : avertissement à
// 9 minutes, déconnexion à 10 minutes. Seule l'activité compte, pas l'horloge de l'appareil
// (EC-TIME-03) : on mesure des durées écoulées depuis la dernière activité.
export const IDLE_LIMIT_MS = 10 * 60_000;
export const IDLE_WARNING_MS = 60_000;

export type IdlePhase =
  { kind: 'active' } | { kind: 'warning'; secondsLeft: number } | { kind: 'expired' };

export function idlePhase(idleMs: number): IdlePhase {
  if (idleMs >= IDLE_LIMIT_MS) return { kind: 'expired' };
  if (idleMs >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
    return { kind: 'warning', secondsLeft: Math.ceil((IDLE_LIMIT_MS - idleMs) / 1000) };
  }
  return { kind: 'active' };
}

/** Adresse de connexion après une déconnexion pour inactivité, avec retour à l'écran d'origine. */
export function idleSignInPath(currentPath: string): string {
  const back =
    currentPath === '/' || !currentPath.startsWith('/')
      ? ''
      : `&retour=${encodeURIComponent(currentPath)}`;
  return `/connexion?raison=inactivite${back}`;
}
