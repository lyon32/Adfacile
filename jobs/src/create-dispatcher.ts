import { AppError } from '@pubeka/contracts';
import type { Env } from '@pubeka/shared';
import { configure, tasks } from '@trigger.dev/sdk';
import {
  InlineJobDispatcher,
  TriggerJobDispatcher,
  registerHandler,
  type JobDispatcher,
} from './dispatcher';
import { analysisRunHandler } from './handlers/analysis-run';
import { campaignPublishHandler } from './handlers/campaign-publish';
import { campaignReconcileHandler } from './handlers/campaign-reconcile';
import { fxRefreshHandler } from './handlers/fx-refresh';
import { systemPingHandler } from './handlers/system-ping';

/** Gestionnaires disponibles en mode `inline` : un par tâche, la même logique que sous Trigger.dev. */
export const inlineHandlers = [
  registerHandler(systemPingHandler),
  registerHandler(analysisRunHandler),
  registerHandler(fxRefreshHandler),
  registerHandler(campaignPublishHandler),
  registerHandler(campaignReconcileHandler),
];

export type DispatcherEnv = Pick<
  Env,
  'PUBEKA_JOB_DISPATCH' | 'TRIGGER_SECRET_KEY' | 'NEXT_PUBLIC_APP_ENV'
>;

/** Choisit le lanceur d'après `PUBEKA_JOB_DISPATCH`. `inline` est refusé en production (TESTING §6.1). */
export function createJobDispatcher(env: DispatcherEnv): JobDispatcher {
  if (env.PUBEKA_JOB_DISPATCH === 'inline') {
    if (env.NEXT_PUBLIC_APP_ENV === 'production') {
      throw new AppError('internal_error', { meta: { reason: 'inline interdit en production' } });
    }
    return new InlineJobDispatcher({ handlers: inlineHandlers });
  }
  if (env.TRIGGER_SECRET_KEY === undefined) {
    throw new AppError('internal_error', { meta: { reason: 'TRIGGER_SECRET_KEY absente' } });
  }
  configure({ accessToken: env.TRIGGER_SECRET_KEY });
  return new TriggerJobDispatcher((taskId, payload, options) =>
    tasks.trigger(taskId, payload, options),
  );
}
