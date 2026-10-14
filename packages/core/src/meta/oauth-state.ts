// Paramètre `state` de la connexion Meta (anti-CSRF, SECURITY_NOTES §2.3 et ENV_SETUP §1.1) :
// signé par le serveur (HMAC avec APP_SIGNING_SECRET, fait par l'appelant : `core` n'a pas
// `node:crypto`), lié à l'utilisateur ET à l'espace, valable 10 minutes, à usage unique.
// Le `state` n'est pas un secret : il dit seulement « cette demande vient de ce serveur, pour
// cet utilisateur ». Le rejeu est refusé par le registre `webhook_events` (nonce).
import { recordWebhookEvent, type ServiceClient } from '@pubeka/db';

export const OAUTH_STATE_TTL_S = 10 * 60;
export type ReturnTo = 'onboarding' | 'settings';

export interface OAuthStatePayload {
  v: 1;
  /** Utilisateur qui a démarré la connexion (doit être celui de la session au retour). */
  u: string;
  /** Espace à connecter. */
  w: string;
  /** Identifiant unique de la demande. */
  n: string;
  /** Expiration, en secondes depuis 1970 (UTC). */
  e: number;
  /** Écran de retour. */
  r: ReturnTo;
}

/** Scelle et ouvre le `state` : signature vérifiée en temps constant par l'implémentation. */
export interface StateCodec {
  seal: (payload: OAuthStatePayload) => string;
  /** Contenu si la signature est valide, sinon `null` ; la forme n'est pas encore vérifiée. */
  open: (token: string) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReturnTo(value: unknown): value is ReturnTo {
  return value === 'onboarding' || value === 'settings';
}

/** Charge utile valide et non expirée, ou `null` (signature, forme et durée contrôlées). */
export function readOAuthState(
  codec: StateCodec,
  token: string,
  now: Date,
): OAuthStatePayload | null {
  const raw = codec.open(token);
  if (!isRecord(raw)) return null;
  const { v, u, w, n, e, r } = raw;
  if (
    v !== 1 ||
    typeof u !== 'string' ||
    typeof w !== 'string' ||
    typeof n !== 'string' ||
    typeof e !== 'number' ||
    !isReturnTo(r)
  ) {
    return null;
  }
  if (n.length < 16 || !Number.isFinite(e)) return null;
  if (Math.floor(now.getTime() / 1000) >= e) return null;
  return { v, u, w, n, e, r };
}

export function createOAuthState(
  codec: StateCodec,
  args: { userId: string; workspaceId: string; nonce: string; returnTo: ReturnTo; now: Date },
): string {
  return codec.seal({
    v: 1,
    u: args.userId,
    w: args.workspaceId,
    n: args.nonce,
    e: Math.floor(args.now.getTime() / 1000) + OAUTH_STATE_TTL_S,
    r: args.returnTo,
  });
}

/** Usage unique : `false` si ce `state` a déjà servi (rejeu). */
export async function consumeOAuthState(svc: ServiceClient, nonce: string): Promise<boolean> {
  return recordWebhookEvent(svc, 'meta_oauth_state', nonce);
}
