// Dépendances des synchronisations (statuts, statistiques) : LECTURE seule chez Meta. Aucune écriture, donc aucun besoin de
// l'interrupteur de publication réelle (PUBEKA_META_PUBLISH) : synchroniser ne dépense rien. Avec `PUBEKA_FAKE_PROVIDERS`
// contenant `meta`, la FAUSSE Meta est servie.
import {
  activeEncryptionKey,
  parseEncryptionKeys,
  type PlatformConnector,
} from '@pubeka/platforms';
import type { Env } from '@pubeka/shared';
import { createFullMetaConnector } from '../../meta/connector-factory';
import { loadToken } from '../../meta/token';
import type { RunPublicationDeps } from '../publish/run-publication';

/** Ce que les synchronisations demandent au connecteur : lire un statut, des statistiques, le motif d'un refus. Jamais plus. */
export type SyncConnector = Pick<PlatformConnector, 'getStatus' | 'fetchStats' | 'fetchRejection'>;

export interface SyncDeps {
  connector: SyncConnector;
  loadToken: RunPublicationDeps['loadToken'];
}

export function createSyncDeps(env: Env, now: () => Date): SyncDeps {
  const keys = parseEncryptionKeys(env.TOKEN_ENCRYPTION_KEYS);
  activeEncryptionKey(keys, env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID);
  return {
    connector: createFullMetaConnector(env, now),
    loadToken: (svc, workspaceId, connection) => loadToken(svc, { keys }, workspaceId, connection),
  };
}
