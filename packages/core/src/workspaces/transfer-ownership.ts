// POST /workspaces/{id}/transfer-ownership (EC-TEAM-06, LLD §10 E8). L'ancien propriétaire
// devient éditeur, en une seule transaction journalisée (`private.transfer_ownership`, 0003).
import { AppError } from '@pubeka/contracts';
import { unwrap, workspacesRepo } from '@pubeka/db';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from './guards';
import { workspaceView, type Workspace } from './workspace-view';

/** Action sensible : connexion de moins de 5 minutes (API_SPEC §2.2 règle 6). */
export const RECENT_LOGIN_MS = 5 * 60 * 1000;

/**
 * Date de la dernière connexion (mot de passe, lien magique, Google, Apple) d'après Supabase
 * Auth. Le rafraîchissement du jeton ne la change pas : une session ouverte depuis longtemps
 * doit se reconnecter.
 */
async function assertRecentLogin(ctx: MemberCtx): Promise<void> {
  const { data, error } = await ctx.svc.auth.admin.getUserById(ctx.user.id);
  if (error !== null) throw new AppError('internal_error', { cause: error });
  const signedInAt = data.user.last_sign_in_at;
  const age =
    signedInAt === undefined ? Infinity : ctx.now().getTime() - new Date(signedInAt).getTime();
  if (!(age <= RECENT_LOGIN_MS)) {
    throw new AppError('mfa_required', { meta: { reason: 'recent_login_required' } });
  }
}

export async function transferOwnership(ctx: MemberCtx, profileId: string): Promise<Workspace> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  if (profileId === ctx.user.id) throw new AppError('conflict');
  const target = unwrap<{ profile_id: string } | null>(
    await ctx.db
      .from('workspace_members')
      .select('profile_id')
      .eq('workspace_id', ctx.workspace.id)
      .eq('profile_id', profileId)
      .maybeSingle(),
  );
  if (target === null) throw new AppError('not_found');
  await assertRecentLogin(ctx);
  await workspacesRepo.transferOwnership(ctx.svc, {
    workspaceId: ctx.workspace.id,
    newOwnerId: profileId,
    actorId: ctx.user.id,
  });
  return workspaceView(ctx, ctx.workspace.id, 'editor');
}
