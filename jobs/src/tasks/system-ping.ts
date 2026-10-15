import { task } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import { systemPingHandler } from '../handlers/system-ping';
import { queues } from '../queues';

// Enveloppe Trigger.dev de `system.ping` : toute la logique est dans le gestionnaire, partagé avec le mode `inline`.
export const systemPingTask = task({
  id: systemPingHandler.id,
  queue: queues.agents,
  run: (payload: unknown) =>
    runHandler(systemPingHandler, payload, { now: () => new Date(), runtime: 'trigger' }),
});
