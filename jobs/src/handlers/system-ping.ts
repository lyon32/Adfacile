import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche d'exemple `system.ping` (S13) : prouve qu'une tâche tourne de la même façon en `inline` et sous Trigger.dev.
// Elle reçoit un identifiant (jamais un objet complet), ne dépend que de `ctx.now()` et peut être rejouée sans effet.
export const SYSTEM_PING_TASK_ID = 'system.ping';

export const systemPingPayloadSchema = z.strictObject({ pingId: z.uuid() });
export type SystemPingPayload = z.infer<typeof systemPingPayloadSchema>;

export interface SystemPingResult {
  pingId: string;
  /** Date de traitement (UTC, ISO 8601), lue sur l'horloge du contexte. */
  handledAt: string;
  runtime: 'inline' | 'trigger';
}

export const systemPingHandler: JobHandlerDefinition<SystemPingPayload, SystemPingResult> = {
  id: SYSTEM_PING_TASK_ID,
  payloadSchema: systemPingPayloadSchema,
  run: (payload, ctx) =>
    Promise.resolve({
      pingId: payload.pingId,
      handledAt: ctx.now().toISOString(),
      runtime: ctx.runtime,
    }),
};
