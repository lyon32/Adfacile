import 'server-only';
// Services de la connexion Meta pour les routes : `state` signé (HMAC-SHA256 avec
// APP_SIGNING_SECRET, comparaison en temps constant), identifiant aléatoire, connecteur Meta
// (réel, ou fausse implémentation avec PUBEKA_FAKE_PROVIDERS=meta). Aucune valeur secrète n'est
// journalisée.
import { randomBytes } from 'node:crypto';
import { createMetaDeps, type MetaDeps } from '@pubeka/core';
import { getEnv } from '@pubeka/shared';
import { createStateCodec } from './state-codec';

/** Dépendances Meta de la requête en cours. */
export function metaDeps(): MetaDeps {
  const env = getEnv();
  return createMetaDeps({
    env,
    now: () => new Date(),
    state: createStateCodec(env.APP_SIGNING_SECRET),
    newNonce: () => randomBytes(24).toString('base64url'),
  });
}
