import 'server-only';
// Services des routes « sources et analyse » : lancement des tâches de fond (Trigger.dev, ou `inline` en test) et
// ré-encodage des images. Le lanceur est créé une fois : en mode `inline` il retient les clés d'idempotence.
import type { JobEnqueuer, StartAnalysisOptions } from '@pubeka/core';
import { createJobDispatcher, type JobDispatcher } from '@pubeka/jobs';
import { getEnv } from '@pubeka/shared';
import { sharpImageProcessor } from '../../../../server/analysis/sharp-processor';

let dispatcher: JobDispatcher | undefined;

function jobs(): JobEnqueuer {
  return {
    async enqueue(taskId, payload, idempotencyKey) {
      dispatcher ??= createJobDispatcher(getEnv());
      await dispatcher.dispatch(taskId, payload, { idempotencyKey });
    },
  };
}

/** Dépendances de `startAnalysis`. Le point d'accroche des quotas et crédits (`beforeSpend`) arrive avec S24. */
export function startAnalysisOptions(): StartAnalysisOptions {
  return { jobs: jobs(), images: sharpImageProcessor };
}
