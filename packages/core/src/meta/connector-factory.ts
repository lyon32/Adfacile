// Construction des dépendances Meta à partir de l'environnement (ENV_SETUP §1.3, §1.4).
// Aucun secret n'est lu ici autrement que par le paramètre `env` (déjà validé par `getEnv`).
import { AppError } from '@pubeka/contracts';
import {
  activeEncryptionKey,
  FakeMetaConnector,
  MetaConnector,
  parseEncryptionKeys,
} from '@pubeka/platforms';
import type { Env } from '@pubeka/shared';
import type { MetaAccountConnector, MetaDeps } from './deps';
import type { StateCodec } from './oauth-state';
import { metaRedirectUri, validateMetaRedirectUri } from './redirect-uri';

/**
 * Taux FCFA/$ exigé par le constructeur du connecteur. Les routes de S11 (connexion, comptes,
 * bilan de santé) ne convertissent aucun montant, et le type `MetaAccountConnector` interdit
 * d'appeler la création de campagne avec ce connecteur : la publication (S16) lira le vrai taux
 * dans les taux de change enregistrés. Valeur d'ordre de grandeur, jamais utilisée pour un prix.
 */
const CONNECTION_ONLY_XAF_PER_USD = 600;

function usesFakeMeta(env: Pick<Env, 'PUBEKA_FAKE_PROVIDERS'>): boolean {
  const list = env.PUBEKA_FAKE_PROVIDERS;
  if (list === undefined) return false;
  return list === 'all' || list.split(',').some((p) => p.trim() === 'meta');
}

let sharedFake: FakeMetaConnector | undefined;

export function createMetaConnector(env: Env, now: () => Date): MetaAccountConnector {
  if (usesFakeMeta(env)) {
    sharedFake ??= new FakeMetaConnector();
    return sharedFake;
  }
  if (env.META_APP_ID === undefined || env.META_APP_SECRET === undefined) {
    throw new AppError('provider_unavailable', {
      cause: new Error('META_APP_ID ou META_APP_SECRET absent'),
    });
  }
  return new MetaConnector({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    loginConfigId: env.META_LOGIN_CONFIG_ID,
    graphVersion: env.META_GRAPH_API_VERSION,
    now,
    // Seul le stockage de Pubeka peut être lu comme média (anti-SSRF).
    allowedMediaHosts: [new URL(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL).hostname],
    xafPerUsd: CONNECTION_ONLY_XAF_PER_USD,
  });
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
