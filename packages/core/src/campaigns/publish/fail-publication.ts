// Échec DÉFINITIF d'une publication : la campagne passe en `error` (événement `send_failed`), le quota retenu est rendu, la
// raison est enregistrée pour l'écran (APPFLOW §8.6). Partagé par la route (tâche impossible à lancer) et par la tâche
// (Meta refuse, délai conclu, jeton expiré). Jamais d'appel à Meta ici.
//
// Le quota n'est rendu que s'il a été retenu pour CETTE tentative (`quota_state = held`) : une republication après refus
// (quota déjà décompté) qui échoue ne rend rien. Rendre est gardé par le changement de statut (une seule fois).
import type { AppError } from '@pubeka/contracts';
import type { ServiceClient } from '@pubeka/db';
import { createLogger } from '@pubeka/shared';
import { toJson, toPublicationError } from './publication-error';
import { applyTransition, recordStatusEvent } from './transitions';
import type { PublishHooks, PublishRow } from './publish-types';

const logger = createLogger({ base: { module: 'fail-publication' } });

/**
 * Erreurs qui demandent de CHANGER quelque chose (contenu de la campagne, moyen de paiement chez Meta) : la campagne revient au
 * brouillon (`error → draft`, événement `reset`) pour être corrigée, et la raison reste affichée. Les autres (Meta ne répond pas,
 * jeton expiré, tâche non lancée) laissent la campagne en `error` : un nouveau clic sur Publier la relance telle quelle.
 */
const BACK_TO_DRAFT: ReadonlySet<string> = new Set([
  'validation_failed',
  'budget_too_low',
  'meta_payment_method_missing',
]);

export interface FailOptions {
  /** Le résultat chez Meta était incertain : la tâche a cherché la campagne avant de conclure. */
  uncertain?: boolean;
  /** Force ou interdit le retour au brouillon (par défaut : selon le code d'erreur). */
  backToDraft?: boolean;
}

export async function failPublication(
  svc: ServiceClient,
  hooks: PublishHooks,
  now: Date,
  row: Pick<PublishRow, 'id' | 'workspace_id' | 'status' | 'quota_state'>,
  error: AppError,
  options: FailOptions = {},
): Promise<'failed' | 'skipped'> {
  const record = toPublicationError(
    error,
    now,
    options.uncertain === true ? { uncertain: true } : {},
  );
  const releasing = row.quota_state === 'held';
  const failed = await applyTransition(svc, row, 'send_failed', {
    publish_error: toJson(record),
    publish_phase: 'none',
    ...(releasing ? { quota_state: 'released' } : {}),
  });
  // Quelqu'un d'autre a déjà conclu (tâche rejouée) : rien à faire, surtout pas rendre le quota deux fois.
  if (failed === null) return 'skipped';

  await recordStatusEvent(svc, row, 'error', 'user', {
    code: record.code,
    uncertain: options.uncertain === true,
  });
  if (releasing && hooks.release !== undefined) {
    try {
      await hooks.release(row.id, row.workspace_id);
    } catch (releaseError) {
      // Le quota reste retenu : à rattraper par S24 / S35. On le dit au journal sans masquer l'échec d'origine.
      logger.error('Quota non rendu après un échec de publication', {
        campaignId: row.id,
        err: releaseError,
      });
    }
  }
  if (options.backToDraft ?? BACK_TO_DRAFT.has(error.code)) {
    await applyTransition(svc, { ...row, status: 'error' }, 'reset', { editable: true });
  }
  return 'failed';
}
