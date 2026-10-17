import {
  createRunPublicationDeps,
  reconcilePublications,
  type ReconcileReport,
} from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { createRequestId, getEnv } from '@pubeka/shared';
import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche `campaign.reconcile` (S16) : reprend, toutes les 10 minutes, les campagnes restées « en publication » faute d'issue
// (lecture de rapprochement en panne, liste coupée, activation inconnue, interrupteur désactivé). Lecture seule chez Meta tant
// que l'interrupteur de publication réelle est désactivé ; jamais de recréation ; au plus 20 campagnes par passage ; un seul
// essai (jamais de relance automatique : la passe suivante réessaie). Au-delà de 24 h sans issue : `error`, quota rendu.
export const CAMPAIGN_RECONCILE_TASK = 'campaign.reconcile';
export const CAMPAIGN_RECONCILE_CRON = '*/10 * * * *';

export const campaignReconcilePayloadSchema = z.strictObject({});
export type CampaignReconcilePayload = z.infer<typeof campaignReconcilePayloadSchema>;

export const campaignReconcileHandler: JobHandlerDefinition<
  CampaignReconcilePayload,
  ReconcileReport
> = {
  id: CAMPAIGN_RECONCILE_TASK,
  payloadSchema: campaignReconcilePayloadSchema,
  run: async (_payload, ctx) => {
    const env = getEnv();
    const svc = createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
    return reconcilePublications(
      { requestId: createRequestId(), svc, now: ctx.now },
      createRunPublicationDeps(env, ctx.now),
    );
  },
};
