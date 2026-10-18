// Dépendances de la tâche `campaign.publish` construites depuis l'environnement (ENV_SETUP §1.3, §1.4). Avec `PUBEKA_FAKE_PROVIDERS`
// contenant `meta`, la FAUSSE Meta est servie : aucun appel réel, aucune dépense. Le jeton n'est déchiffré que dans la tâche.
import { activeEncryptionKey, parseEncryptionKeys } from '@pubeka/platforms';
import type { Env } from '@pubeka/shared';
import { createFullMetaConnector, type MetaConnectorEnv } from '../../meta/connector-factory';
import { loadToken } from '../../meta/token';
import type { CampaignControlDeps } from './campaign-control';
import { metaPublishAllowed } from './publish-switch';
import type { RunPublicationDeps } from './run-publication';

/** Environnement de la publication : le connecteur Meta et le chiffrement des jetons, rien d'autre. */
export type PublicationEnv = MetaConnectorEnv &
  Pick<Env, 'TOKEN_ENCRYPTION_KEYS' | 'TOKEN_ENCRYPTION_ACTIVE_KEY_ID'>;

export function createRunPublicationDeps(env: PublicationEnv, now: () => Date): RunPublicationDeps {
  const keys = parseEncryptionKeys(env.TOKEN_ENCRYPTION_KEYS);
  // Valide aussi que la clé active existe : sans elle, aucun jeton ne se déchiffre.
  activeEncryptionKey(keys, env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID);
  return {
    connector: createFullMetaConnector(env, now),
    // Interrupteur de publication réelle (PUBEKA_META_PUBLISH), évalué à chaque appel par les cas d'usage.
    metaPublishEnabled: () => metaPublishAllowed(env),
    loadToken: (svc, workspaceId, connection) => loadToken(svc, { keys }, workspaceId, connection),
  };
}

/** Pause, reprise, relance : même connecteur et même déchiffrement du jeton que la tâche de publication. */
export function createCampaignControlDeps(
  env: PublicationEnv,
  now: () => Date,
): CampaignControlDeps {
  const keys = parseEncryptionKeys(env.TOKEN_ENCRYPTION_KEYS);
  activeEncryptionKey(keys, env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID);
  return {
    connector: createFullMetaConnector(env, now),
    // Interrupteur de publication réelle (PUBEKA_META_PUBLISH), évalué à chaque appel par les cas d'usage.
    metaPublishEnabled: () => metaPublishAllowed(env),
    loadToken: (svc, workspaceId, connection) => loadToken(svc, { keys }, workspaceId, connection),
  };
}
