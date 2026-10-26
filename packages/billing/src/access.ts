// État d'accès d'un espace (SECURITY_NOTES §2.1, LLD §6.9, TR-PAY-07). Fonctions pures : l'heure est toujours passée par l'appelant
// (`ctx.now()`), jamais lue ici. Appelé par packages/core (workspaces/access.ts, workspace-view.ts). Lit seulement une ligne
// d'abonnement { status, period_end, grace_until } ; n'écrit rien. Modèle (décision de la personne du 26/10/2026) :
//  - essai (`trialing`) en cours ou formule payée en période : `active` ;
//  - essai terminé SANS abonnement : `locked` tout de suite, sans grâce ;
//  - fin de période d'une formule payée (ou annulation : c'est la même chose) : `grace` pendant 3 jours (lecture, achat de crédits,
//    pause ; ni création, ni publication, ni génération, ni modification), puis `locked` ;
//  - `read_only` et `suspended` ne viennent que de l'administration et restent distincts.

export type SubscriptionStatus = 'trialing' | 'active' | 'grace' | 'read_only' | 'canceled';
/** Valeur stockée dans `workspaces.status` (l'administration peut suspendre ou mettre en lecture seule). */
export type StoredWorkspaceStatus = 'active' | 'read_only' | 'suspended';
/** Accès déduit de l'abonnement seul. */
export type SubscriptionAccess = 'active' | 'grace' | 'locked';
export type EffectiveAccess = SubscriptionAccess | 'read_only' | 'suspended';

/** Dates acceptées en `Date` ou en texte ISO (ligne lue en base). */
export interface AccessSubscription {
  status: SubscriptionStatus;
  period_end: Date | string;
  grace_until: Date | string | null;
}

/** Délai de grâce après la fin de période (décision de la personne : 3 jours). */
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 3600 * 1000;

function toMs(value: Date | string): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

function graceEndMs(sub: AccessSubscription, endMs: number): number {
  const extended = sub.grace_until === null ? Number.NaN : toMs(sub.grace_until);
  return extended > endMs ? extended : endMs + GRACE_DAYS * DAY_MS;
}

/**
 * Accès selon l'abonnement. Une date ou une heure illisible donne `locked` (en cas de doute, on n'ouvre rien).
 * Le statut `read_only` d'un abonnement (hérité) est verrouillé. L'annulation (`canceled`) se comporte comme une formule payée :
 * seule la fin de période compte.
 */
export function workspaceAccess(sub: AccessSubscription, now: Date): SubscriptionAccess {
  if (sub.status === 'read_only') return 'locked';
  const end = toMs(sub.period_end);
  const nowMs = now.getTime();
  if (Number.isNaN(end) || Number.isNaN(nowMs)) return 'locked';
  if (nowMs < end) return 'active';
  if (sub.status === 'trialing') return 'locked';
  return nowMs < graceEndMs(sub, end) ? 'grace' : 'locked';
}

/**
 * Accès réel d'un espace : la suspension et la lecture seule posées par l'administration passent avant l'abonnement ; sans
 * abonnement (l'essai démarre au clic, S24) l'espace reste actif avec les limites Starter.
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

/** Fin de la grâce d'une formule payée (affichée dans le bandeau « Passé le JJ/MM… »). `null` : essai, statut hérité, date illisible. */
export function graceEndsAt(sub: AccessSubscription): Date | null {
  if (sub.status === 'trialing' || sub.status === 'read_only') return null;
  const end = toMs(sub.period_end);
  return Number.isNaN(end) ? null : new Date(graceEndMs(sub, end));
}

/**
 * L'instant EXACT où l'espace devient verrouillé : fin d'essai, ou fin de grâce. C'est la valeur dont la session S19b (pause
 * automatique des publicités à la fin de la grâce) a besoin pour savoir quels espaces traiter. `null` : pas de verrouillage daté.
 */
export function lockAt(sub: AccessSubscription): Date | null {
  if (sub.status === 'read_only') return null;
  const end = toMs(sub.period_end);
  if (Number.isNaN(end)) return null;
  return sub.status === 'trialing' ? new Date(end) : new Date(graceEndMs(sub, end));
}

export type AccessCause = 'grace' | 'trial_ended' | 'subscription_ended' | 'admin';

/**
 * Pourquoi l'espace n'est pas simplement actif, pour afficher le bon message : `grace`, `trial_ended` (essai terminé),
 * `subscription_ended` (formule payée échue après la grâce, ou statut hérité), `admin` (lecture seule ou suspension décidée par
 * l'administration). `null` : actif.
 */
export function accessCause(
  stored: StoredWorkspaceStatus,
  sub: AccessSubscription | null,
  now: Date,
): AccessCause | null {
  if (stored !== 'active') return 'admin';
  const access = effectiveAccess(stored, sub, now);
  if (access === 'active') return null;
  if (access === 'grace') return 'grace';
  return sub?.status === 'trialing' ? 'trial_ended' : 'subscription_ended';
}
