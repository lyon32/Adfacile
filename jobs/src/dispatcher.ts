import { AppError } from '@pubeka/contracts';
import type { z } from 'zod';

// Lancement des tâches de fond (TESTING §6.1). `JobDispatcher` est l'interface ; deux réalisations :
// - `TriggerJobDispatcher` : envoie la tâche à Trigger.dev (`PUBEKA_JOB_DISPATCH=trigger`) ;
// - `InlineJobDispatcher` : exécute la tâche dans le même processus (`PUBEKA_JOB_DISPATCH=inline`, refusé en production).
// Une tâche reçoit des identifiants et peut être relancée sans double effet : la clé d'idempotence est obligatoire.

export interface JobContext {
  now: () => Date;
  runtime: 'inline' | 'trigger';
}

export interface JobHandlerDefinition<P, R> {
  /** Identifiant `domaine.action` (CONVENTIONS §9). */
  id: string;
  payloadSchema: z.ZodType<P>;
  run: (payload: P, ctx: JobContext) => Promise<R>;
}

export interface DispatchOptions {
  /** Deux lancements avec la même clé ne produisent qu'une exécution. */
  idempotencyKey: string;
}

export interface DispatchResult {
  /** Identifiant d'exécution : `inline_<n>` ou l'identifiant `run_…` de Trigger.dev. */
  runId: string;
  /** `true` si la clé d'idempotence avait déjà servi : rien n'a été relancé. */
  deduplicated: boolean;
}

export interface JobDispatcher {
  dispatch(taskId: string, payload: unknown, options: DispatchOptions): Promise<DispatchResult>;
}

/** Valide la charge puis exécute le gestionnaire. Partagé par le mode `inline` et par les tâches Trigger.dev. */
export async function runHandler<P, R>(
  handler: JobHandlerDefinition<P, R>,
  payload: unknown,
  ctx: JobContext,
): Promise<R> {
  const parsed = handler.payloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError('validation_failed', {
      meta: { task: handler.id, fields: parsed.error.issues.map((issue) => issue.path.join('.')) },
    });
  }
  return handler.run(parsed.data, ctx);
}

/** Gestionnaire dont la charge n'est pas connue du registre : `runHandler` la valide. */
export interface RegisteredHandler {
  id: string;
  execute: (payload: unknown, ctx: JobContext) => Promise<unknown>;
}

/** Enregistre un gestionnaire dans le mode `inline`, sans perdre le typage de sa charge. */
export function registerHandler<P, R>(handler: JobHandlerDefinition<P, R>): RegisteredHandler {
  return { id: handler.id, execute: (payload, ctx) => runHandler(handler, payload, ctx) };
}

export interface InlineDispatcherOptions {
  handlers: readonly RegisteredHandler[];
  now?: () => Date;
}

export class InlineJobDispatcher implements JobDispatcher {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly seen = new Map<string, DispatchResult>();
  private readonly now: () => Date;
  private counter = 0;
  /** Résultats des exécutions terminées, lisibles par les tests d'intégration. */
  readonly results = new Map<string, unknown>();

  constructor(options: InlineDispatcherOptions) {
    for (const handler of options.handlers) this.handlers.set(handler.id, handler);
    this.now = options.now ?? (() => new Date());
  }

  async dispatch(
    taskId: string,
    payload: unknown,
    options: DispatchOptions,
  ): Promise<DispatchResult> {
    const dedupKey = `${taskId}:${options.idempotencyKey}`;
    const previous = this.seen.get(dedupKey);
    if (previous) return { ...previous, deduplicated: true };

    const handler = this.handlers.get(taskId);
    if (!handler) throw new AppError('internal_error', { meta: { task: taskId } });

    this.counter += 1;
    const result: DispatchResult = { runId: `inline_${String(this.counter)}`, deduplicated: false };
    // La clé est retenue avant l'exécution : un échec n'est pas rejoué avec la même clé (EC-META-05).
    this.seen.set(dedupKey, result);
    const output = await handler.execute(payload, { now: this.now, runtime: 'inline' });
    this.results.set(result.runId, output);
    return result;
  }
}

/** Ce que `TriggerJobDispatcher` utilise du SDK Trigger.dev (`tasks.trigger`) : injectable dans les tests. */
export type TriggerFunction = (
  taskId: string,
  payload: unknown,
  options: { idempotencyKey: string },
) => Promise<{ id: string; isCached?: boolean }>;

export class TriggerJobDispatcher implements JobDispatcher {
  constructor(private readonly trigger: TriggerFunction) {}

  async dispatch(
    taskId: string,
    payload: unknown,
    options: DispatchOptions,
  ): Promise<DispatchResult> {
    const handle = await this.trigger(taskId, payload, { idempotencyKey: options.idempotencyKey });
    return { runId: handle.id, deduplicated: handle.isCached === true };
  }
}
