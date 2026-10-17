import { task } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import { campaignPublishHandler } from '../handlers/campaign-publish';
import { queues } from '../queues';

// Enveloppe Trigger.dev de `campaign.publish` : toute la logique est dans le gestionnaire, partagé avec le mode `inline`.
// Un seul essai (`maxAttempts` 1, trigger.config.ts) : la création chez Meta n'est jamais relancée automatiquement.
export const campaignPublishTask = task({
  id: campaignPublishHandler.id,
  queue: queues.metaPublish,
  retry: { maxAttempts: 1 },
  run: (payload: unknown) =>
    runHandler(campaignPublishHandler, payload, { now: () => new Date(), runtime: 'trigger' }),
});
