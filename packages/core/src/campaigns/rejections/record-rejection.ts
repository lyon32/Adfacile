// Enregistrement d'un refus de Meta (S18). LECTURE seule chez Meta : on lit le motif (`ad_review_feedback`) d'UNE publicité
// refusée et on écrit une ligne `rejections` en attente d'explication. Rien n'est dépensé, rien n'est relancé (EC-META-05).
//
// Idempotent : un seul refus OUVERT par publicité (index unique de la migration 0018). Le même refus lu deux fois, ou deux
// synchronisations qui se croisent, n'écrivent qu'une ligne ; le Modérateur n'est donc appelé qu'une fois par refus.
import { AppError } from '@pubeka/contracts';
import { unwrap, type ServiceClient } from '@pubeka/db';
import type { PlatformCampaignRefs, PlatformConnector, PlatformToken } from '@pubeka/platforms';
import { createLogger } from '@pubeka/shared';
import { recordStatusEvent } from '../publish/transitions';

const logger = createLogger({ base: { module: 'record-rejection' } });

/** Ce que l'enregistrement d'un refus demande au connecteur : lire le motif. Jamais plus. */
export type RejectionConnector = Pick<PlatformConnector, 'fetchRejection'>;

const MAX_REASON = 2000;

export interface AdRef {
  /** Identifiant de la ligne `ads` (Pubeka). */
  id: string;
  /** Identifiant de la publicité chez Meta. */
  metaAdId: string;
}

export interface RecordedRejection {
  id: string;
  /** Faux quand le refus était déjà enregistré (et ouvert) : rien n'a été écrit. */
  created: boolean;
}

function db(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

async function findOpen(
  svc: ServiceClient,
  workspaceId: string,
  campaignId: string,
  adId: string | null,
): Promise<string | null> {
  let query = svc
    .from('rejections')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .eq('fixed_and_republished', false);
  query = adId === null ? query.is('ad_id', null) : query.eq('ad_id', adId);
  const found = unwrap<{ id: string }[]>(await query.limit(1));
  return found[0]?.id ?? null;
}

/** Y a-t-il déjà un refus ouvert pour cette publicité (ou pour la campagne entière si `adId` est nul) ? */
export async function hasOpenRejection(
  svc: ServiceClient,
  workspaceId: string,
  campaignId: string,
  adId: string | null,
): Promise<boolean> {
  return (await findOpen(svc, workspaceId, campaignId, adId)) !== null;
}

/**
 * Lit chez Meta le motif du refus d'une publicité et l'enregistre. Renvoie `null` si Meta ne montre pas cette publicité comme
 * refusée (rien n'est écrit). `ad` est nul pour une campagne sans publicité enregistrée (refus de la campagne entière).
 */
export async function recordRejection(
  svc: ServiceClient,
  connector: RejectionConnector,
  input: {
    workspaceId: string;
    campaignId: string;
    token: PlatformToken;
    refs: PlatformCampaignRefs;
    ad: AdRef | null;
  },
): Promise<RecordedRejection | null> {
  const { workspaceId, campaignId, ad } = input;
  const adId = ad?.id ?? null;
  const existing = await findOpen(svc, workspaceId, campaignId, adId);
  if (existing !== null) return { id: existing, created: false };

  const remote = await connector.fetchRejection(input.token, {
    ...input.refs,
    adId: ad?.metaAdId ?? input.refs.adId,
  });
  if (remote === null) return null;

  const inserted = await svc
    .from('rejections')
    .insert({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      ad_id: adId,
      meta_reason: remote.reason.slice(0, MAX_REASON),
      fixed_and_republished: false,
      explain_status: 'pending',
    })
    .select('id')
    .single();
  if (inserted.error !== null) {
    // 23505 : une autre synchronisation vient d'écrire le même refus.
    if (inserted.error.code === '23505') {
      const winner = await findOpen(svc, workspaceId, campaignId, adId);
      if (winner !== null) return { id: winner, created: false };
    }
    throw db(inserted.error);
  }

  if (adId !== null) {
    const marked = await svc
      .from('ads')
      .update({ status: 'rejected' })
      .eq('workspace_id', workspaceId)
      .eq('id', adId);
    if (marked.error !== null) {
      logger.error('Publicité non marquée refusée', { campaignId, code: marked.error.code });
    }
  }
  await recordStatusEvent(svc, { id: campaignId, workspace_id: workspaceId }, 'rejected', 'poll', {
    rejection_id: inserted.data.id,
    ad_id: adId,
  });
  return { id: inserted.data.id, created: true };
}
