import {
  createRunPublicationDeps,
  PUBLISH_TASK,
  publishPayloadSchema,
  runPublication,
  type PublicationOutcome,
  type PublishPayload,
} from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { createRequestId, getEnv } from '@pubeka/shared';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche `campaign.publish` (S16) : crée la campagne chez Meta, l'active, la passe en `in_review`. Elle reçoit seulement des
// identifiants, relit tout en base, et peut être rejouée sans effet double : la phase de la publication est enregistrée, un
// résultat incertain est RAPPROCHÉ chez Meta et jamais rejoué (SECURITY_NOTES EC-META-05). Aucune relance automatique
// (`maxAttempts` 1) : une tâche qui engage de l'argent ne se relance pas d'elle-même.
export { PUBLISH_TASK };

export const campaignPublishPayloadSchema = publishPayloadSchema;
export type CampaignPublishPayload = PublishPayload;

export const campaignPublishHandler: JobHandlerDefinition<
  CampaignPublishPayload,
  PublicationOutcome
> = {
  id: PUBLISH_TASK,
  payloadSchema: campaignPublishPayloadSchema,
  run: async (payload, ctx) => {
    const env = getEnv();
    const svc = createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
    return runPublication(
      { requestId: createRequestId(), svc, now: ctx.now },
      payload,
      createRunPublicationDeps(env, ctx.now),
    );
  },
};
