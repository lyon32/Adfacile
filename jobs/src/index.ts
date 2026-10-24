// Module @pubeka/jobs : tâches de fond Trigger.dev (LLD §2.1, ARCHITECTURE §8.4 et §10).
// Les tâches elles-mêmes sont dans `tasks/` (chargées par `trigger.config.ts`) ; l'application lance une tâche par
// un `JobDispatcher` (`createJobDispatcher`), jamais en important une tâche.
export * from './dispatcher';
export * from './create-dispatcher';
export * from './queue-limits';
export * from './handlers/system-ping';
export * from './handlers/analysis-run';
export * from './handlers/campaign-publish';
export * from './handlers/campaign-reconcile';
export * from './handlers/fx-refresh';
export * from './handlers/campaign-sync';
