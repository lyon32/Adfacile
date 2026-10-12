// Forme `Workspace` d'openapi.yaml : espace, rôle de l'utilisateur, formule et quotas.
import { one, unwrap } from '@pubeka/db';
import type { Ctx, MemberRole } from '../context';
import {
  DEFAULT_LIMITS_PLAN,
  limitsFor,
  planLimits,
  subscriptionsOf,
  type WorkspacePlan,
} from './plan-limits';

export type WorkspaceStatus = 'active' | 'read_only' | 'suspended';

export interface WorkspaceQuotas {
  members: number;
  members_limit: number;
  pages_limit: number;
  campaigns_limit: number;
}

export interface Workspace {
  id: string;
  name: string;
  status: WorkspaceStatus;
  role: MemberRole;
  plan: WorkspacePlan;
  period_end: string | null;
  grace_until: string | null;
  quotas: WorkspaceQuotas;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  status: WorkspaceStatus;
  role: MemberRole;
}

/**
 * Complète des espaces dont l'utilisateur est membre (vérifié par l'appelant) avec leur
 * formule et leurs quotas. Les membres sont comptés par le client de l'utilisateur (RLS).
 */
export async function toWorkspaces(ctx: Ctx, refs: readonly WorkspaceRef[]): Promise<Workspace[]> {
  if (refs.length === 0) return [];
  const ids = refs.map((r) => r.id);
  const memberRows = unwrap(
    await ctx.db.from('workspace_members').select('workspace_id').in('workspace_id', ids),
  );
  const counts = new Map<string, number>();
  for (const row of memberRows) {
    counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
  }
  const subscriptions = await subscriptionsOf(ctx.svc, ids);
  const limits = await planLimits(ctx.svc);
  return refs.map((ref) => {
    const sub = subscriptions.get(ref.id);
    const plan = limitsFor(limits, sub?.limitsOf ?? DEFAULT_LIMITS_PLAN);
    return {
      id: ref.id,
      name: ref.name,
      status: ref.status,
      role: ref.role,
      plan: sub?.plan ?? 'trial',
      period_end: sub?.period_end ?? null,
      grace_until: sub?.grace_until ?? null,
      quotas: {
        members: counts.get(ref.id) ?? 0,
        members_limit: plan.max_members,
        pages_limit: plan.max_pages,
        campaigns_limit: plan.campaigns_per_period,
      },
    };
  });
}

/** Un espace dont l'utilisateur est membre avec le rôle donné. */
export async function workspaceView(
  ctx: Ctx,
  workspaceId: string,
  role: MemberRole,
): Promise<Workspace> {
  const row = one<Omit<WorkspaceRef, 'role'>>(
    await ctx.db.from('workspaces').select('id, name, status').eq('id', workspaceId).maybeSingle(),
  );
  const [view] = await toWorkspaces(ctx, [{ ...row, role }]);
  if (view === undefined) throw new Error('toWorkspaces : espace manquant');
  return view;
}
