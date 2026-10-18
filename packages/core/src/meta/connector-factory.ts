// Construction des dépendances Meta à partir de l'environnement (ENV_SETUP §1.3, §1.4).
// Aucun secret n'est lu ici autrement que par le paramètre `env` (déjà validé par `getEnv`).
import { AppError } from '@pubeka/contracts';
import {
  activeEncryptionKey,
  FakeMetaConnector,
  MetaConnector,
  parseEncryptionKeys,
  type PlatformConnector,
} from '@pubeka/platforms';
import type { Env } from '@pubeka/shared';
import type { MetaAccountConnector, MetaDeps } from './deps';
import type { StateCodec } from './oauth-state';
import { usesFakeMeta } from './fake-providers';
import { PUBLISH_SWITCH_ENABLED } from '../campaigns/publish/publish-switch';
import { guardPublishWrites } from './publish-gate';
import { metaRedirectUri, validateMetaRedirectUri } from './redirect-uri';

let sharedFake: FakeMetaConnector | undefined;

/** Connecteur complet (réel ou faux) : la connexion n'en utilise qu'une partie (`MetaAccountConnector`), la publication le reste. */
export function createFullMetaConnector(env: Env, now: () => Date): PlatformConnector {
  if (usesFakeMeta(env)) {
    sharedFake ??= new FakeMetaConnector();
    return sharedFake;
  }
  if (env.META_APP_ID === undefined || env.META_APP_SECRET === undefined) {
    throw new AppError('provider_unavailable', {
      cause: new Error('META_APP_ID ou META_APP_SECRET absent'),
    });
  }
  const real = new MetaConnector({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    loginConfigId: env.META_LOGIN_CONFIG_ID,
    graphVersion: env.META_GRAPH_API_VERSION,
    now,
    // Seul le stockage de Pubeka peut être lu comme média (anti-SSRF).
    allowedMediaHosts: [new URL(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL).hostname],
    // Aucun taux ici : chaque demande de publication porte la monnaie du compte et son taux enregistré (S16).
  });
  // Défense en profondeur : le connecteur RÉEL ne crée ni n'active rien sans `PUBEKA_META_PUBLISH=enabled`.
  return guardPublishWrites(real, () => env.PUBEKA_META_PUBLISH === PUBLISH_SWITCH_ENABLED);
}

export function createMetaConnector(env: Env, now: () => Date): MetaAccountConnector {
  return createFullMetaConnector(env, now);
}

export function createMetaDeps(args: {
  env: Env;
  now: () => Date;
  state: StateCodec;
  newNonce: () => string;
  /** Remplace le connecteur (tests). */
  connector?: MetaAccountConnector;
}): MetaDeps {
  const { env } = args;
  const redirectUri = metaRedirectUri(env.NEXT_PUBLIC_APP_URL);
  const check = validateMetaRedirectUri(redirectUri);
  if (!check.valid) {
    throw new AppError('provider_unavailable', { cause: new Error(check.errors.join(' ')) });
  }
  const keys = parseEncryptionKeys(env.TOKEN_ENCRYPTION_KEYS);
  return {
    connector: args.connector ?? createMetaConnector(env, args.now),
    redirectUri,
    keys,
    activeKey: activeEncryptionKey(keys, env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID),
    state: args.state,
    newNonce: args.newNonce,
  };
}
