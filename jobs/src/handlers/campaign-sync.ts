import {
  createSyncDeps,
  SYNC_STATS_TASK,
  syncCampaignStatuses,
  syncCampaignStats,
  type StatsSyncReport,
  type StatusSyncReport,
} from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { createRequestId, getEnv } from '@pubeka/shared';
import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Synchronisations de S17 (LECTURE seule chez Meta : aucune dépense, aucune écriture, aucune relance automatique).
//  - `campaign.sync-status` : statuts des campagnes publiées. Toutes les 15 minutes (filet de sécurité des webhooks, charge `{}`)
//    ou lancée par un webhook (`{ scope: 'webhook' }` : seulement les campagnes qui ont reçu un signal de Meta). Un webhook n'est
//    qu'un signal : le statut est RELU chez Meta (TR-PLA-05, EC-META-08).
//  - `campaign.sync-stats` : statistiques. Toutes les heures (charge `{}`) ou à la demande (`{ campaignId, workspaceId }`, bouton
//    « Actualiser » : au plus une fois par 5 minutes et par campagne, la limite est appliquée par la base) (TR-PLA-06).
// Limite de débit de Meta (EC-META-10) : la passe s'arrête, les dernières valeurs restent. Rejouable sans double effet.
export const CAMPAIGN_SYNC_STATUS_TASK = 'campaign.sync-status';
export const CAMPAIGN_SYNC_STATUS_CRON = '*/15 * * * *';
export const CAMPAIGN_SYNC_STATS_TASK = SYNC_STATS_TASK;
export const CAMPAIGN_SYNC_STATS_CRON = '0 * * * *';

export const campaignSyncStatusPayloadSchema = z.strictObject({
  scope: z.enum(['all', 'webhook']).optional(),
});
export type CampaignSyncStatusPayload = z.infer<typeof campaignSyncStatusPayloadSchema>;

export const campaignSyncStatsPayloadSchema = z
  .strictObject({ campaignId: z.uuid().optional(), workspaceId: z.uuid().optional() })
  .refine((p) => (p.campaignId === undefined) === (p.workspaceId === undefined), {
    message: 'campaignId et workspaceId vont ensemble',
  });
export type CampaignSyncStatsPayload = z.infer<typeof campaignSyncStatsPayloadSchema>;

function serviceClient() {
  const env = getEnv();
  return {
    env,
    svc: createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    }),
  };
}

export const campaignSyncStatusHandler: JobHandlerDefinition<
  CampaignSyncStatusPayload,
  StatusSyncReport
> = {
  id: CAMPAIGN_SYNC_STATUS_TASK,
  payloadSchema: campaignSyncStatusPayloadSchema,
  run: async (payload, ctx) => {
    const { env, svc } = serviceClient();
    return syncCampaignStatuses(
      { requestId: createRequestId(), svc, now: ctx.now },
      createSyncDeps(env, ctx.now),
      { scope: payload.scope ?? 'all' },
    );
  },
};

export const campaignSyncStatsHandler: JobHandlerDefinition<
  CampaignSyncStatsPayload,
  StatsSyncReport
> = {
  id: CAMPAIGN_SYNC_STATS_TASK,
  payloadSchema: campaignSyncStatsPayloadSchema,
  run: async (payload, ctx) => {
    const { env, svc } = serviceClient();
    return syncCampaignStats(
      { requestId: createRequestId(), svc, now: ctx.now },
      createSyncDeps(env, ctx.now),
      {
        ...(payload.campaignId === undefined ? {} : { campaignId: payload.campaignId }),
        ...(payload.workspaceId === undefined ? {} : { workspaceId: payload.workspaceId }),
      },
    );
  },
};
