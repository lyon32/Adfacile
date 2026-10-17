// Jeton Meta : chiffré avant d'être écrit, déchiffré seulement au moment d'appeler Meta. Il ne
// quitte jamais le serveur (SECURITY_NOTES §2.3 : « jamais le jeton »), n'apparaît dans aucune
// réponse, aucun journal, aucune erreur.
import { AppError } from '@pubeka/contracts';
import { unwrap, type ServiceClient } from '@pubeka/db';
import { decryptToken, encryptToken, type PlatformToken } from '@pubeka/platforms';
import type { MetaDeps } from './deps';

export interface StoredConnection {
  id: string;
  expiresAt: Date | null;
}

export function sealToken(deps: MetaDeps, plain: string): { sealed: string; keyId: string } {
  return { sealed: encryptToken(plain, deps.activeKey), keyId: deps.activeKey.id };
}

/** Jeton déchiffré de la connexion de cet espace ; `not_found` si elle n'existe pas. */
export async function loadToken(
  svc: ServiceClient,
  deps: Pick<MetaDeps, 'keys'>,
  workspaceId: string,
  connection: StoredConnection,
): Promise<PlatformToken> {
  const rows = unwrap(await svc.rpc('get_meta_token', { ws: workspaceId, conn: connection.id }));
  const row = rows[0];
  if (row === undefined) throw new AppError('not_found');
  return {
    accessToken: decryptToken(row.sealed, deps.keys),
    expiresAt: connection.expiresAt,
  };
}
