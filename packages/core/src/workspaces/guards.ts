// Deuxième barrière des droits (SECURITY_NOTES §2.7) : `api()` vérifie déjà le rôle et l'état
// de l'espace ; le cas d'usage revérifie, car une tâche de fond ou une autre route peut
// l'appeler.
import { AppError } from '@pubeka/contracts';
import type { MemberCtx, MemberRole } from '../context';

export function assertRole(ctx: MemberCtx, roles: readonly MemberRole[]): void {
  if (!roles.includes(ctx.workspace.role)) throw new AppError('role_insufficient');
}

/**
 * Espace modifiable : SEUL l'état « actif » écrit (décision de la personne du 26/10/2026). La grâce de 3 jours et la lecture seule
 * de l'administration donnent `workspace_read_only`, le verrouillage `workspace_locked`, la suspension `workspace_suspended`.
 */
export function assertWritable(ctx: MemberCtx): void {
  const access = ctx.workspace.access;
  if (access === 'suspended') throw new AppError('workspace_suspended');
  if (access === 'locked') throw new AppError('workspace_locked');
  if (access !== 'active') throw new AppError('workspace_read_only');
}

/** Actions d'argent permises en grâce, lecture seule et verrouillé (paiement, preuve de paiement) : seule la suspension les refuse (§2.1, décision 4). */
export function assertNotSuspended(ctx: MemberCtx): void {
  if (ctx.workspace.access === 'suspended') throw new AppError('workspace_suspended');
}
