// Formule d'un espace et limites qui en découlent (plans-et-credits §1, ARCHITECTURE §5).
// Lues avec le client service : l'abonnement n'est lisible que par le propriétaire (RLS),
// alors que tous les membres voient la formule et les quotas (SECURITY_NOTES §2.2).
import type { SubscriptionStatus } from '@pubeka/billing';
import { AppError } from '@pubeka/contracts';
import { unwrap, type ServiceClient } from '@pubeka/db';
import type { PlanCode, ServiceCtx } from '../context';

/** `trial` : essai en cours, ou aucune formule encore choisie (l'essai démarre en S24). */
export type WorkspacePlan = 'trial' | PlanCode;

export interface PlanLimits {
  max_members: number;
  max_pages: number;
  campaigns_per_period: number;
}

export interface WorkspaceSubscription {
  plan: WorkspacePlan;
  /** Formule dont les limites s'appliquent. */
  limitsOf: PlanCode;
  /** Statut brut de l'abonnement ; `null` sans abonnement. */
  status: SubscriptionStatus | null;
  period_end: string | null;
  grace_until: string | null;
}

const PLAN_CODES = ['starter', 'pro', 'business'] as const satisfies readonly PlanCode[];

/**
 * Sans abonnement (essai pas encore commencé), les limites les plus basses s'appliquent :
 * celles de Starter (1 membre, le propriétaire). Décision S06, à valider (PR).
 */
export const DEFAULT_LIMITS_PLAN: PlanCode = 'starter';

/** Durée de validité d'un lien d'invitation. Décision S06, à valider (PR). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toPlanCode(code: string): PlanCode {
  const found = PLAN_CODES.find((c) => c === code);
  if (found === undefined) throw new AppError('internal_error');
  return found;
}

/** Abonnement le plus récent de chaque espace (absent : `trial`, limites de Starter). */
export async function subscriptionsOf(
  svc: ServiceClient,
  workspaceIds: readonly string[],
): Promise<Map<string, WorkspaceSubscription>> {
  const out = new Map<string, WorkspaceSubscription>();
  if (workspaceIds.length > 0) {
    const rows = unwrap(
      await svc
        .from('subscriptions')
        .select('workspace_id, plan_code, status, period_end, grace_until, created_at')
        .in('workspace_id', [...workspaceIds])
        .order('created_at', { ascending: false }),
    );
    for (const row of rows) {
      if (out.has(row.workspace_id)) continue;
      const code = toPlanCode(row.plan_code);
      out.set(row.workspace_id, {
        plan: row.status === 'trialing' ? 'trial' : code,
        limitsOf: code,
        status: row.status,
        period_end: row.period_end,
        grace_until: row.grace_until,
      });
    }
  }
  for (const id of workspaceIds) {
    if (!out.has(id)) {
      out.set(id, {
        plan: 'trial',
        limitsOf: DEFAULT_LIMITS_PLAN,
        status: null,
        period_end: null,
        grace_until: null,
      });
    }
  }
  return out;
}

/** Limites de chaque formule (y compris une formule retirée de la vente). */
export async function planLimits(svc: ServiceClient): Promise<Map<PlanCode, PlanLimits>> {
  const rows = unwrap(
    await svc.from('plans').select('code, max_members, max_pages, campaigns_per_period'),
  );
  const out = new Map<PlanCode, PlanLimits>();
  for (const row of rows) {
    out.set(toPlanCode(row.code), {
      max_members: row.max_members,
      max_pages: row.max_pages,
      campaigns_per_period: row.campaigns_per_period,
    });
  }
  return out;
}

export function limitsFor(limits: Map<PlanCode, PlanLimits>, plan: PlanCode): PlanLimits {
  const found = limits.get(plan);
  if (found === undefined) throw new AppError('internal_error');
  return found;
}

/** Limite de membres de la formule actuelle de l'espace (propriétaire compris). */
export async function memberLimitOf(svc: ServiceClient, workspaceId: string): Promise<number> {
  const sub = (await subscriptionsOf(svc, [workspaceId])).get(workspaceId);
  const plan = sub?.limitsOf ?? DEFAULT_LIMITS_PLAN;
  return limitsFor(await planLimits(svc), plan).max_members;
}

/** Membres de l'espace, propriétaire compris. */
export async function countMembers(svc: ServiceClient, workspaceId: string): Promise<number> {
  const rows = unwrap(
    await svc.from('workspace_members').select('profile_id').eq('workspace_id', workspaceId),
  );
  return rows.length;
}

/**
 * EC-TEAM-07 : passage à une formule qui accepte moins de membres que l'espace n'en a.
 * Refusé tant que le propriétaire n'a pas retiré les membres en trop ; `meta` donne de quoi
 * les lister à l'écran. Appelé par le changement de formule (S24, S25).
 */
export async function assertMembersFitPlan(
  ctx: ServiceCtx,
  workspaceId: string,
  targetPlan: PlanCode,
): Promise<void> {
  const members = await countMembers(ctx.svc, workspaceId);
  const limit = limitsFor(await planLimits(ctx.svc), targetPlan).max_members;
  if (members > limit) {
    throw new AppError('member_limit_reached', {
      meta: { members, members_limit: limit, members_to_remove: members - limit },
    });
  }
}
