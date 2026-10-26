// État d'accès d'un espace (SECURITY_NOTES §2.1, LLD §6.9, TR-PAY-07). Fonctions pures : l'heure
// est toujours passée par l'appelant (`ctx.now()`), jamais lue ici.

export type SubscriptionStatus = 'trialing' | 'active' | 'grace' | 'read_only' | 'canceled';
/** Valeur stockée dans `workspaces.status` (l'administration peut suspendre ou mettre en lecture seule). */
export type StoredWorkspaceStatus = 'active' | 'read_only' | 'suspended';
export type SubscriptionAccess = 'active' | 'grace' | 'read_only';
export type EffectiveAccess = SubscriptionAccess | 'suspended';

/** Dates acceptées en `Date` ou en texte ISO (ligne lue en base). */
export interface AccessSubscription {
  status: SubscriptionStatus;
  period_end: Date | string;
  grace_until: Date | string | null;
}

/** Délai de grâce après la fin de période (✅ Q48). */
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 3600 * 1000;

function toMs(value: Date | string): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/**
 * Accès selon l'abonnement :
 * - en période : `active` ;
 * - après la fin d'une formule payée : `grace` pendant 3 jours (ou jusqu'à `grace_until` si
 *   l'administration a prolongé), puis `read_only` ;
 * - essai (`trialing`) terminé : `read_only` tout de suite, sans grâce (décision 5 du 10/10/2026) ;
 * - `canceled` : accès jusqu'à la fin de la période payée, puis `read_only` sans grâce ;
 * - `read_only` stocké : `read_only`.
 * Une date illisible donne `read_only` (en cas de doute, on n'ouvre pas l'écriture).
 */
export function workspaceAccess(sub: AccessSubscription, now: Date): SubscriptionAccess {
  if (sub.status === 'read_only') return 'read_only';
  const end = toMs(sub.period_end);
  const nowMs = now.getTime();
  if (Number.isNaN(end) || Number.isNaN(nowMs)) return 'read_only';
  if (nowMs < end) return 'active';
  if (sub.status === 'trialing' || sub.status === 'canceled') return 'read_only';
  return nowMs < graceEndMs(sub, end) ? 'grace' : 'read_only';
}

function graceEndMs(sub: AccessSubscription, endMs: number): number {
  const extended = sub.grace_until === null ? Number.NaN : toMs(sub.grace_until);
  return extended > endMs ? extended : endMs + GRACE_DAYS * DAY_MS;
}

/** Fin de la grâce d'une formule payée (affichée dans le bandeau « Renouvelle avant le… »). */
export function graceEndsAt(sub: AccessSubscription): Date | null {
  if (sub.status === 'trialing' || sub.status === 'canceled' || sub.status === 'read_only') {
    return null;
  }
  const end = toMs(sub.period_end);
  return Number.isNaN(end) ? null : new Date(graceEndMs(sub, end));
}

/**
 * Accès réel d'un espace : la suspension et la lecture seule posées par l'administration passent
 * avant l'abonnement ; sans abonnement (l'essai démarre au clic, S24) l'espace reste actif.
 */
export function effectiveAccess(
  stored: StoredWorkspaceStatus,
  sub: AccessSubscription | null,
  now: Date,
): EffectiveAccess {
  if (stored === 'suspended') return 'suspended';
  if (stored === 'read_only') return 'read_only';
  return sub === null ? 'active' : workspaceAccess(sub, now);
}
