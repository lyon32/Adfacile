import { schedules } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import { CAMPAIGN_EXPLAIN_CRON, campaignExplainHandler } from '../handlers/campaign-explain';
import { queues } from '../queues';

// Enveloppe Trigger.dev de `campaign.explain-rejections` (https://trigger.dev/docs/tasks/scheduled) : toutes les 5 minutes (UTC),
// dans la file `agents` (elle appelle le Modérateur). UN seul essai : jamais de relance automatique.
export const campaignExplainTask = schedules.task({
  id: campaignExplainHandler.id,
  cron: CAMPAIGN_EXPLAIN_CRON,
  queue: queues.agents,
  retry: { maxAttempts: 1 },
  run: () => runHandler(campaignExplainHandler, {}, { now: () => new Date(), runtime: 'trigger' }),
});
