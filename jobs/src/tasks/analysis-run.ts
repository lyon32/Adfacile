import { task } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import { analysisRunHandler } from '../handlers/analysis-run';
import { queues } from '../queues';

// Enveloppe Trigger.dev de `analysis.run` : toute la logique est dans le gestionnaire, partagé avec le mode `inline`.
// Un seul essai (`maxAttempts` 1 par défaut, trigger.config.ts) : l'appel IA n'est jamais relancé automatiquement.
export const analysisRunTask = task({
  id: analysisRunHandler.id,
  queue: queues.agents,
  run: (payload: unknown) =>
    runHandler(analysisRunHandler, payload, { now: () => new Date(), runtime: 'trigger' }),
});
