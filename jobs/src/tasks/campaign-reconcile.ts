import { schedules } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import { CAMPAIGN_RECONCILE_CRON, campaignReconcileHandler } from '../handlers/campaign-reconcile';
import { queues } from '../queues';

// Enveloppe Trigger.dev de `campaign.reconcile` (https://trigger.dev/docs/tasks/scheduled) : toutes les 10 minutes (UTC), dans la
// file `meta-publish` (elle parle à Meta). UN seul essai : jamais de relance automatique, la passe suivante réessaie.
export const campaignReconcileTask = schedules.task({
  id: campaignReconcileHandler.id,
  cron: CAMPAIGN_RECONCILE_CRON,
  queue: queues.metaPublish,
  retry: { maxAttempts: 1 },
  run: () =>
    runHandler(campaignReconcileHandler, {}, { now: () => new Date(), runtime: 'trigger' }),
});
