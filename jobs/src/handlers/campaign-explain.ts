import { createExplainDeps, explainPendingRejections } from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { createRequestId, getEnv } from '@pubeka/shared';
import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche `campaign.explain-rejections` (S18) : le Modérateur explique les refus de Meta enregistrés par la synchronisation des
// statuts (lecture seule chez Meta). Il n'est appelé QU'APRÈS un refus, une seule fois par refus (l'état de l'explication est pris
// par une écriture gardée), au plus 10 refus par passage. Un appel au résultat incertain n'est jamais relancé d'office
// (EC-META-05, `maxAttempts` 1) : l'échec est enregistré sur le refus et l'écran montre le motif de Meta tel quel.
export const CAMPAIGN_EXPLAIN_TASK = 'campaign.explain-rejections';
export const CAMPAIGN_EXPLAIN_CRON = '*/5 * * * *';

export const campaignExplainPayloadSchema = z.strictObject({});
export type CampaignExplainPayload = z.infer<typeof campaignExplainPayloadSchema>;

export interface CampaignExplainResult {
  explained: number;
  failed: number;
  skipped: number;
}

export const campaignExplainHandler: JobHandlerDefinition<
  CampaignExplainPayload,
  CampaignExplainResult
> = {
  id: CAMPAIGN_EXPLAIN_TASK,
  payloadSchema: campaignExplainPayloadSchema,
  run: async (_payload, ctx) => {
    const env = getEnv();
    const svc = createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
    return explainPendingRejections(
      { requestId: createRequestId(), svc, now: ctx.now },
      createExplainDeps(env),
    );
  },
};
