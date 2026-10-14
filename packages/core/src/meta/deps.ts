// Dépendances des cas d'usage Meta : construites par `apps/web` (`metaDeps()`), remplacées par
// des fausses implémentations dans les tests (TESTING §6).
import type { EncryptionKey, PlatformConnector } from '@pubeka/platforms';
import type { StateCodec } from './oauth-state';

/**
 * Ce que S11 demande au connecteur : connexion, lecture des comptes, bilan de santé. Créer ou
 * modifier une campagne n'est volontairement pas exposé ici (S16).
 */
export type MetaAccountConnector = Pick<
  PlatformConnector,
  'authorizeUrl' | 'exchangeCode' | 'listAdAccounts' | 'listPages' | 'healthCheck'
>;

export interface MetaDeps {
  connector: MetaAccountConnector;
  /** Adresse de retour envoyée à Facebook et rejouée à l'échange du code. */
  redirectUri: string;
  /** Toutes les clés de chiffrement connues (rotation). */
  keys: Record<string, Uint8Array>;
  /** La clé qui chiffre les nouveaux jetons. */
  activeKey: EncryptionKey;
  state: StateCodec;
  /** Identifiant aléatoire d'au moins 16 caractères pour chaque demande de connexion. */
  newNonce: () => string;
}
