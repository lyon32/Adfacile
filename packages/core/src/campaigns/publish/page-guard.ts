// La Page d'une campagne doit être dans la formule de l'espace (TR-PLA-08, EC-CAMP-03 et EC-CAMP-09). Une Page « active » est
// une Page comptée dans la limite de la formule (1 / 3 / 10) ; une Page retirée de la formule ne peut plus publier ni être modifiée,
// mais ses campagnes déjà publiées continuent chez Meta et peuvent être mises en pause.
import { AppError } from '@pubeka/contracts';
import type { ServiceClient } from '@pubeka/db';
import { upgradeTarget } from '../../meta/pages';
import { pagePlanOf } from '../../meta/plan';
import { subscriptionsOf } from '../../workspaces/plan-limits';

/** EC-CAMP-03 et EC-CAMP-09 : la Page doit être dans la formule (active). */
export async function assertPageInPlan(
  scope: { svc: ServiceClient; workspaceId: string },
  page: { active: boolean } | null,
  pageId: string | null,
): Promise<void> {
  if (pageId === null || page === null) {
    throw new AppError('validation_failed', {
      errors: [
        { field: 'page_id', code: 'required', message: 'Choisis la Page qui publiera cette pub.' },
      ],
    });
  }
  if (page.active) return;
  const plan = await pagePlanOf(scope.svc, scope.workspaceId);
  const subscription = (await subscriptionsOf(scope.svc, [scope.workspaceId])).get(
    scope.workspaceId,
  );
  const upgradeTo = upgradeTarget(plan.plan);
  throw new AppError('page_limit_reached', {
    meta: {
      pages_limit: plan.maxPages,
      ...(upgradeTo === null ? {} : { upgrade_to: upgradeTo }),
      available_from: subscription?.period_end ?? null,
    },
  });
}
