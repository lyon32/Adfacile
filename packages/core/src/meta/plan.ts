// Formule de l'espace pour les Pages : limite (1 / 3 / 10) et début de la période en cours,
// qui sert au verrouillage d'une Page (APPFLOW §6.2).
import { unwrap, type ServiceClient } from '@pubeka/db';
import { limitsFor, planLimits, subscriptionsOf } from '../workspaces/plan-limits';

export interface PagePlan {
  maxPages: number;
  /** Début de la période de l'abonnement le plus récent ; `null` sans abonnement. */
  periodStart: string | null;
}

export async function pagePlanOf(svc: ServiceClient, workspaceId: string): Promise<PagePlan> {
  const sub = (await subscriptionsOf(svc, [workspaceId])).get(workspaceId);
  const limits = await planLimits(svc);
  const maxPages = limitsFor(limits, sub?.limitsOf ?? 'starter').max_pages;
  const latest = unwrap<{ period_start: string } | null>(
    await svc
      .from('subscriptions')
      .select('period_start')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  return { maxPages, periodStart: latest?.period_start ?? null };
}
