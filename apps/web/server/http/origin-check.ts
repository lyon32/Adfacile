// Protection CSRF (API_SPEC §2.2 règle 4) : une écriture authentifiée par cookie doit venir
// de l'application elle-même. Un jeton `Authorization: Bearer` (mobile, outils) n'est pas
// envoyé automatiquement par un navigateur : il n'est pas soumis à ce contrôle.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

export function hasBearer(headers: Headers): boolean {
  return /^Bearer\s+\S+/i.test(headers.get('authorization') ?? '');
}

/** true si la requête doit être refusée (`403 forbidden`). */
export function isForbiddenOrigin(req: Request, appUrl: string): boolean {
  if (!isWriteMethod(req.method)) return false;
  if (hasBearer(req.headers)) return false;
  // Sans cookie, rien n'est envoyé automatiquement par le navigateur : la session répondra 401.
  if ((req.headers.get('cookie') ?? '') === '') return false;
  const origin = req.headers.get('origin');
  return origin === null || origin !== new URL(appUrl).origin;
}
