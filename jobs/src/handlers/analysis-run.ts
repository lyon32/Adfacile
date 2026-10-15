import { ANALYSIS_RUN_TASK, createAnalysisRunDeps, runAnalysis } from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { createRequestId, getEnv } from '@pubeka/shared';
import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche `analysis.run` (S14) : lit les sources, appelle l'Analyste, enregistre la fiche et les questions.
// Elle reçoit seulement des identifiants. Relancée avec les mêmes identifiants, elle ne refait rien (le passage
// « en file → lecture » est atomique dans `runAnalysis`). Elle ne se relance jamais d'elle-même (EC-META-05).
export { ANALYSIS_RUN_TASK };

export const analysisRunPayloadSchema = z.strictObject({
  analysisId: z.uuid(),
  workspaceId: z.uuid(),
});
export type AnalysisRunPayload = z.infer<typeof analysisRunPayloadSchema>;

export interface AnalysisRunResult {
  outcome: 'skipped' | 'questions' | 'blocked' | 'failed';
}

export const analysisRunHandler: JobHandlerDefinition<AnalysisRunPayload, AnalysisRunResult> = {
  id: ANALYSIS_RUN_TASK,
  payloadSchema: analysisRunPayloadSchema,
  run: async (payload, ctx) => {
    const env = getEnv();
    const svc = createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
    return runAnalysis(
      { requestId: createRequestId(), svc, now: ctx.now },
      payload,
      createAnalysisRunDeps(env),
    );
  },
};
