// Deuxième barrière des droits (SECURITY_NOTES §2.7) : `api()` vérifie déjà le rôle et l'état
// de l'espace ; le cas d'usage revérifie, car une tâche de fond ou une autre route peut
// l'appeler.
import { AppError } from '@pubeka/contracts';
import type { MemberCtx, MemberRole } from '../context';

export function assertRole(ctx: MemberCtx, roles: readonly MemberRole[]): void {
  if (!roles.includes(ctx.workspace.role)) throw new AppError('role_insufficient');
}

/** Espace modifiable : ni suspendu, ni en lecture seule (la grâce reste modifiable, §2.1). */
export function assertWritable(ctx: MemberCtx): void {
  if (ctx.workspace.access === 'suspended') throw new AppError('workspace_suspended');
  if (ctx.workspace.access === 'read_only') throw new AppError('workspace_read_only');
}
