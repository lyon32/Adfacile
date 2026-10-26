// Tâche planifiée `campaign.lock-pause` (S19b, TR-PAY-07, EC-PAY-11) : toutes les 10 minutes, repère les espaces VERROUILLÉS (grâce de
// 3 jours écoulée, `grace_until` prolongé compris, ou essai terminé sans abonnement) qui ont encore des campagnes vivantes chez Meta et
// les met en pause. Décision de la personne (26/10/2026) : « les publicités restent en pause jusqu'au renouvellement » ; la REPRISE est
// MANUELLE (`resume-locked.ts`), jamais automatique.
//
//  - Les espaces viennent de `workspaces_to_lock_pause(maintenant, limite)` (migration 0022, même règle que `private.ws_access`) puis
//    chaque espace est RELU avec `loadWorkspaceAccess` juste avant d'agir : un renouvellement survenu entre-temps n'est pas pausé.
//  - Aucun autre espace n'est touché : le moteur ne lit que les campagnes de l'espace traité.
//  - Rejouable sans double effet : une campagne déjà en pause n'est plus listée ; deux passes simultanées = une seule écriture.
//  - Un échec chez Meta (jeton expiré, réseau, limite de débit) ne marque JAMAIS « en pause » : la passe suivante réessaie (la pause
//    est sans danger à rejouer, contrairement à une dépense). Aucun envoi d'e-mail ici (S26/S27).
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { PlatformToken } from '@pubeka/platforms';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from '../../context';
import { loadWorkspaceAccess } from '../../workspaces/access';
import {
  BILLING_LOCK_REASON,
  pauseWorkspaceCampaigns,
  type LockPauseDeps,
  type PauseBudget,
  type PauseFailure,
} from './pause-workspace';

const logger = createLogger({ base: { module: 'lock-pause-sweep' } });

/** Espaces examinés au plus par passage. */
export const LOCK_PAUSE_WORKSPACES_PER_PASS = 50;
/** Campagnes mises en pause au plus par passage (chacune coûte un ordre et une relecture chez Meta : limites de débit, EC-META-10). */
export const LOCK_PAUSE_CAMPAIGNS_PER_PASS = 100;

export interface LockPauseReport {
  /** Espaces verrouillés trouvés avec des campagnes vivantes. */
  workspaces: number;
  /** Espaces écartés parce que, relus, ils ne sont plus verrouillés (renouvelés entre-temps). */
  not_locked: number;
  paused: number;
  failed: (PauseFailure & { workspace_id: string })[];
  rate_limited: boolean;
  budget_exhausted: boolean;
}

export async function pauseLockedWorkspaces(
  ctx: ServiceCtx,
  deps: LockPauseDeps,
  options: { workspaceLimit?: number; campaignBudget?: number } = {},
): Promise<LockPauseReport> {
  const limit = Math.max(
    1,
    Math.min(
      options.workspaceLimit ?? LOCK_PAUSE_WORKSPACES_PER_PASS,
      LOCK_PAUSE_WORKSPACES_PER_PASS,
    ),
  );
  const listed = unwrap<{ workspace_id: string }[]>(
    await ctx.svc.rpc('workspaces_to_lock_pause', {
      p_now: ctx.now().toISOString(),
      p_limit: limit,
    }),
  );
  const report: LockPauseReport = {
    workspaces: listed.length,
    not_locked: 0,
    paused: 0,
    failed: [],
    rate_limited: false,
    budget_exhausted: false,
  };
  const budget: PauseBudget = { left: options.campaignBudget ?? LOCK_PAUSE_CAMPAIGNS_PER_PASS };
  const tokens = new Map<string, Promise<PlatformToken>>();

  for (const { workspace_id: workspaceId } of listed) {
    if (budget.left <= 0) {
      report.budget_exhausted = true;
      break;
    }
    try {
      const one = await pauseWorkspaceCampaigns(
        ctx,
        deps,
        workspaceId,
        {
          source: 'poll',
          reason: BILLING_LOCK_REASON,
          budget,
          // L'accès est relu AVANT CHAQUE campagne : un renouvellement survenu pendant la passe n'est pas pausé.
          stillApplies: async () =>
            (await loadWorkspaceAccess(ctx.svc, ctx.svc, workspaceId, ctx.now())) === 'locked',
        },
        tokens,
      );
      if (one.guard_stopped) report.not_locked += 1;
      report.paused += one.paused;
      for (const failed of one.failed) report.failed.push({ ...failed, workspace_id: workspaceId });
      if (one.budget_exhausted) report.budget_exhausted = true;
      if (one.rate_limited) report.rate_limited = true;
      // Limite de l'APPLICATION chez Meta : on n'insiste pas sur les autres espaces, la passe suivante reprendra.
      if (one.app_limited) break;
    } catch (error) {
      // Une erreur d'un espace (lecture en base) n'arrête pas les autres.
      const code = error instanceof AppError ? error.code : 'internal_error';
      report.failed.push({ campaign_id: '', name: '', code, workspace_id: workspaceId });
      logger.error('Espace verrouillé non traité', { workspaceId, code, err: error });
    }
  }
  return report;
}
