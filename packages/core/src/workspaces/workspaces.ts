// GET /workspaces, GET et PATCH /workspaces/{id} (API_SPEC §14 « Espaces et équipe »).
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { Ctx, MemberCtx } from '../context';
import { assertRole, assertWritable } from './guards';
import { toWorkspaces, workspaceView, type Workspace } from './workspace-view';

/** Espaces dont l'utilisateur est membre, du plus ancien au plus récent. */
export async function listWorkspaces(ctx: Ctx): Promise<Workspace[]> {
  const memberships = unwrap(
    await ctx.db
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('profile_id', ctx.user.id),
  );
  if (memberships.length === 0) return [];
  const roles = new Map(memberships.map((m) => [m.workspace_id, m.role]));
  const rows = unwrap(
    await ctx.db
      .from('workspaces')
      .select('id, name, status')
      .in('id', [...roles.keys()])
      .order('created_at', { ascending: true }),
  );
  return toWorkspaces(
    ctx,
    rows.flatMap((row) => {
      const role = roles.get(row.id);
      return role === undefined ? [] : [{ ...row, role }];
    }),
  );
}

export async function getWorkspace(ctx: MemberCtx): Promise<Workspace> {
  return workspaceView(ctx, ctx.workspace.id, ctx.workspace.role);
}

/** Renommer : propriétaire, espace modifiable (SECURITY_NOTES §2.2). */
export async function renameWorkspace(ctx: MemberCtx, name: string): Promise<Workspace> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  const updated = unwrap(
    await ctx.db.from('workspaces').update({ name }).eq('id', ctx.workspace.id).select('id'),
  );
  // Aucune ligne : la RLS (ws_rename) a refusé, ou l'espace a disparu.
  if (updated.length === 0) throw new AppError('not_found');
  return getWorkspace(ctx);
}
