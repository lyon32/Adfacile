// Changements de statut d'une campagne publiée : TOUS passent par `nextCampaignStatus` (machine d'état de S15, LLD §6.8),
// jamais un statut écrit à la main. Chaque changement est UNE instruction `update … where status = <lu>` (et la version ou la
// phase lues si on les donne) : la base n'en laisse passer qu'une quand deux processus se croisent (double clic, tâche
// rejouée). La garde SQL `private.guard_campaign_status` reste le filet derrière.
import { AppError } from '@pubeka/contracts';
import type { Json, ServiceClient, TablesUpdate } from '@pubeka/db';
import { createLogger } from '@pubeka/shared';
import { nextCampaignStatus, type CampaignEvent, type CampaignStatus } from '../campaign-state';
import { toPublishRow } from './publish-row';
import { PUBLISH_COLUMNS, type PublishPhase, type PublishRow } from './publish-types';

const logger = createLogger({ base: { module: 'campaign-transitions' } });

export interface TransitionGuard {
  /** Version lue : la transition échoue si quelqu'un a modifié la campagne entre-temps. */
  version?: number;
  /** Phase de publication lue (tâche rejouée). */
  phase?: PublishPhase;
}

export interface TransitionSubject {
  id: string;
  workspace_id: string;
  status: CampaignStatus;
}

function internal(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

/**
 * Applique `event` à la campagne si elle est encore dans l'état lu. Renvoie la ligne écrite, ou `null` quand quelqu'un
 * d'autre a gagné (état ou version ou phase différents). Un événement interdit dans cet état est une erreur de programmation :
 * `internal_error` (la machine dit non), jamais une écriture.
 */
export async function applyTransition(
  svc: ServiceClient,
  subject: TransitionSubject,
  event: CampaignEvent,
  patch: TablesUpdate<'campaigns'> = {},
  guard: TransitionGuard = {},
): Promise<PublishRow | null> {
  const from = subject.status;
  const next = nextCampaignStatus(from, event);
  if (!next.ok) {
    throw new AppError('internal_error', {
      meta: { reason: 'invalid_transition', from: next.error.from, event: next.error.event },
    });
  }
  let query = svc
    .from('campaigns')
    .update({ ...patch, status: next.status })
    .eq('workspace_id', subject.workspace_id)
    .eq('id', subject.id)
    .eq('status', from);
  if (guard.version !== undefined) query = query.eq('version', guard.version);
  if (guard.phase !== undefined) query = query.eq('publish_phase', guard.phase);
  const written = await query.select(PUBLISH_COLUMNS);
  if (written.error !== null) throw internal(written.error);
  const row = written.data[0];
  return row === undefined ? null : toPublishRow(row);
}

/** Mise à jour sans changement de statut (phase, références) gardée par la phase lue. */
export async function updateWhilePublishing(
  svc: ServiceClient,
  subject: { id: string; workspace_id: string },
  patch: TablesUpdate<'campaigns'>,
  guard: { phase: PublishPhase },
): Promise<PublishRow | null> {
  const written = await svc
    .from('campaigns')
    .update(patch)
    .eq('workspace_id', subject.workspace_id)
    .eq('id', subject.id)
    .eq('status', 'publishing')
    .eq('publish_phase', guard.phase)
    .select(PUBLISH_COLUMNS);
  if (written.error !== null) throw internal(written.error);
  const row = written.data[0];
  return row === undefined ? null : toPublishRow(row);
}

/** Trace dans l'historique de la campagne. Un échec de journal ne casse jamais l'opération : il est journalisé. */
export async function recordStatusEvent(
  svc: ServiceClient,
  subject: { id: string; workspace_id: string },
  status: string,
  source: 'user' | 'poll' | 'webhook',
  payload: Json | null = null,
): Promise<void> {
  const inserted = await svc.from('campaign_status_events').insert({
    workspace_id: subject.workspace_id,
    campaign_id: subject.id,
    status,
    source,
    payload,
  });
  if (inserted.error !== null) {
    logger.error('Historique de campagne non écrit', {
      campaignId: subject.id,
      status,
      code: inserted.error.code,
    });
  }
}
