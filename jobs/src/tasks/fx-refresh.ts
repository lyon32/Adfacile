import { schedules } from '@trigger.dev/sdk';
import { runHandler } from '../dispatcher';
import { fxRefreshHandler } from '../handlers/fx-refresh';

// Enveloppe Trigger.dev de `fx.refresh` (https://trigger.dev/docs/tasks/scheduled) : exécution toutes les 6 heures (UTC).
// Le fournisseur ne publie qu'une fois par jour : le cas d'usage ne fait la requête que si la prochaine mise à jour annoncée
// est passée, les autres exécutions ne font rien. UN seul essai : jamais de relance automatique.
export const fxRefreshTask = schedules.task({
  id: fxRefreshHandler.id,
  cron: '0 */6 * * *',
  retry: { maxAttempts: 1 },
  run: () => runHandler(fxRefreshHandler, {}, { now: () => new Date(), runtime: 'trigger' }),
});
