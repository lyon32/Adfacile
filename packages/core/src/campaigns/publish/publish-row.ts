// Lecture d'une campagne avec ses colonnes de publication (migration 0014).
import { AppError } from '@pubeka/contracts';
import type { DbClient } from '@pubeka/db';
import { isCampaignStatus } from '../campaign-state';
import {
  PUBLISH_COLUMNS,
  type PublishPhase,
  type PublishRow,
  type QuotaState,
} from './publish-types';

const PHASES: readonly PublishPhase[] = ['none', 'creating', 'created', 'activating', 'done'];
const QUOTA_STATES: readonly QuotaState[] = ['none', 'held', 'counted', 'released'];

function phaseOf(value: string): PublishPhase {
  const found = PHASES.find((phase) => phase === value);
  if (found === undefined) throw new AppError('internal_error', { meta: { reason: 'phase' } });
  return found;
}

function quotaOf(value: string): QuotaState {
  const found = QUOTA_STATES.find((state) => state === value);
  if (found === undefined) throw new AppError('internal_error', { meta: { reason: 'quota' } });
  return found;
}

type RawRow = Omit<PublishRow, 'publish_phase' | 'quota_state' | 'status'> & {
  publish_phase: string;
  quota_state: string;
  status: string;
};

/** Valide les deux colonnes à valeurs fermées ; le reste vient de la base déjà typée. */
export function toPublishRow(raw: RawRow): PublishRow {
  if (!isCampaignStatus(raw.status))
    throw new AppError('internal_error', { meta: { reason: 'status' } });
  return {
    ...raw,
    status: raw.status,
    publish_phase: phaseOf(raw.publish_phase),
    quota_state: quotaOf(raw.quota_state),
  };
}

/** Lecture filtrée par espace ; une campagne d'un autre espace est introuvable (404, jamais 403). */
export async function loadPublishRow(
  reader: DbClient,
  workspaceId: string,
  campaignId: string,
): Promise<PublishRow> {
  const found = await reader
    .from('campaigns')
    .select(PUBLISH_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  if (found.data === null) throw new AppError('not_found');
  return toPublishRow(found.data);
}
