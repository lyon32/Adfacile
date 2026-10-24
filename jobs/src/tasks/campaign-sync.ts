import { schedules, task } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import {
  CAMPAIGN_SYNC_STATS_CRON,
  CAMPAIGN_SYNC_STATUS_CRON,
  campaignSyncStatsHandler,
  campaignSyncStatusHandler,
} from '../handlers/campaign-sync';
import { queues } from '../queues';

// Enveloppes Trigger.dev des synchronisations de S17 (https://trigger.dev/docs/tasks/scheduled). Deux tâches lançables à la demande
// (webhook de Meta, bouton « Actualiser ») et deux planifications (UTC) qui appellent le même gestionnaire. File `meta-sync`
// (lectures seulement). UN seul essai : jamais de relance automatique, la passe suivante réessaie.
export const campaignSyncStatusTask = task({
  id: campaignSyncStatusHandler.id,
  queue: queues.metaSync,
  retry: { maxAttempts: 1 },
  run: (payload: unknown) =>
    runHandler(campaignSyncStatusHandler, payload, { now: () => new Date(), runtime: 'trigger' }),
});

export const campaignSyncStatusPollTask = schedules.task({
  id: `${campaignSyncStatusHandler.id}.poll`,
  cron: CAMPAIGN_SYNC_STATUS_CRON,
  queue: queues.metaSync,
  retry: { maxAttempts: 1 },
  run: () =>
    runHandler(campaignSyncStatusHandler, {}, { now: () => new Date(), runtime: 'trigger' }),
});

export const campaignSyncStatsTask = task({
  id: campaignSyncStatsHandler.id,
  queue: queues.metaSync,
  retry: { maxAttempts: 1 },
  run: (payload: unknown) =>
    runHandler(campaignSyncStatsHandler, payload, { now: () => new Date(), runtime: 'trigger' }),
});

export const campaignSyncStatsHourlyTask = schedules.task({
  id: `${campaignSyncStatsHandler.id}.hourly`,
  cron: CAMPAIGN_SYNC_STATS_CRON,
  queue: queues.metaSync,
  retry: { maxAttempts: 1 },
  run: () =>
    runHandler(campaignSyncStatsHandler, {}, { now: () => new Date(), runtime: 'trigger' }),
});
