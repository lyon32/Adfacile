// Accès réel d'un espace (SECURITY_NOTES §2.1) : l'état stocké (suspension ou lecture seule
// décidées par l'administration) passe avant l'abonnement, dont l'échéance est évaluée à chaque
// requête avec `ctx.now()` : aucune tâche planifiée n'est nécessaire pour que la grâce se termine.
import {
  effectiveAccess,
  type StoredWorkspaceStatus,
  type SubscriptionStatus,
} from '@pubeka/billing';
import { unwrap, type DbClient, type ServiceClient } from '@pubeka/db';
import type { WorkspaceAccess } from '../context';

interface LatestSubscription {
  status: SubscriptionStatus;
  period_end: string;
  grace_until: string | null;
}

/**
 * `null` si l'espace n'est pas visible avec `db` (client de l'utilisateur, soumis à la RLS).
 * L'abonnement est lu avec le client service : seul le propriétaire le voit par la RLS, alors
 * que l'état d'accès concerne tous les membres.
 */
export async function loadWorkspaceAccess(
  db: DbClient | ServiceClient,
  svc: ServiceClient,
  workspaceId: string,
  now: Date,
): Promise<WorkspaceAccess | null> {
  const ws = unwrap<{ status: StoredWorkspaceStatus } | null>(
    await db.from('workspaces').select('status').eq('id', workspaceId).maybeSingle(),
  );
  if (ws === null) return null;
  // Suspension et lecture seule décidées par l'administration : l'abonnement ne change rien.
  if (ws.status !== 'active') return effectiveAccess(ws.status, null, now);
  const rows = unwrap<LatestSubscription[]>(
    await svc
      .from('subscriptions')
      .select('status, period_end, grace_until')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1),
  );
  return effectiveAccess(ws.status, rows[0] ?? null, now);
}
