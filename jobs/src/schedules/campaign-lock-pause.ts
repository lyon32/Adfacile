import { schedules } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import {
  CAMPAIGN_LOCK_PAUSE_CRON,
  campaignLockPauseHandler,
} from '../handlers/campaign-lock-pause';
import { queues } from '../queues';

// Enveloppe Trigger.dev de `campaign.lock-pause` (https://trigger.dev/docs/tasks/scheduled) : toutes les 10 minutes (UTC), dans la file
// `meta-publish` (elle ÉCRIT chez Meta : l'ordre de pause). UN seul essai : jamais de relance automatique par Trigger.dev, la passe
// suivante réessaie (la pause est sans danger à rejouer). Une planification déclarée dans le code est créée au déploiement
// (« declarative schedules ») ; elle ne tourne qu'avec les variables d'environnement posées sur Trigger.dev (démarche 👤, ENV_SETUP).
export const campaignLockPauseTask = schedules.task({
  id: campaignLockPauseHandler.id,
  cron: CAMPAIGN_LOCK_PAUSE_CRON,
  queue: queues.metaPublish,
  retry: { maxAttempts: 1 },
  run: () =>
    runHandler(campaignLockPauseHandler, {}, { now: () => new Date(), runtime: 'trigger' }),
});
