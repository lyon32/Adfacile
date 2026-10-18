import 'server-only';
// Services des routes « propositions » : passerelle IA (réelle ou fausse selon PUBEKA_FAKE_PROVIDERS) et réglage des modèles.
// Les points d'accroche des quotas et des crédits (`beforeSpend`, `afterAccepted`) arrivent avec S24.
import {
  createProposalDeps,
  type JobEnqueuer,
  type ProposalDeps,
  type PublishCampaignDeps,
} from '@pubeka/core';
import { getEnv } from '@pubeka/shared';
import { createJobDispatcher, type JobDispatcher } from '@pubeka/jobs';

let deps: ProposalDeps | undefined;

export function proposalDeps(): ProposalDeps {
  deps ??= createProposalDeps(getEnv());
  return deps;
}

let dispatcher: JobDispatcher | undefined;

function createJobEnqueuer(): JobEnqueuer {
  return {
    async enqueue(taskId, payload, idempotencyKey) {
      dispatcher ??= createJobDispatcher(getEnv());
      await dispatcher.dispatch(taskId, payload, { idempotencyKey });
    },
  };
}

let publishOverride: PublishCampaignDeps | undefined;
let publishDefault: PublishCampaignDeps | undefined;

/**
 * Dépendances de la route `publish` : lancement de la tâche (Trigger.dev, ou `inline` en développement) et points d'accroche
 * du quota (S24 les remplira : `beforeSpend`, `afterAccepted`, `release`).
 */
export function publishDeps(): PublishCampaignDeps {
  if (publishOverride !== undefined) return publishOverride;
  publishDefault ??= { jobs: createJobEnqueuer() };
  return publishDefault;
}

/** Tests d'intégration seulement : remplace les dépendances (fausse file de tâches, quota simulé). Refusé en production. */
export function overridePublishDeps(deps: PublishCampaignDeps | undefined): void {
  if (getEnv().NEXT_PUBLIC_APP_ENV === 'production') {
    throw new Error('overridePublishDeps est réservé aux tests');
  }
  publishOverride = deps;
}
