// Refus PARTIEL d'un test A/B (EC-META-06) : « une seule des deux pubs est refusée : la campagne reste active avec l'autre pub ;
// le Modérateur ne traite que la pub refusée ».
//
// Meta donne le statut d'une publicité, et `getStatus` lit la première. Pour une campagne à plusieurs publicités on lit donc
// CHAQUE publicité (lecture seule). La campagne n'est « refusée » que si TOUTES le sont ; sinon son statut ne change pas et
// chaque publicité refusée a son propre rapport. Une campagne à une seule publicité garde le comportement simple : son statut
// vient de `getStatus`, le refus est enregistré après la transition `refuse`.
import { unwrap, type ServiceClient } from '@pubeka/db';
import type { PlatformCampaignRefs, PlatformToken } from '@pubeka/platforms';
import { hasOpenRejection, recordRejection, type RejectionConnector } from './record-rejection';

interface AdRow {
  id: string;
  meta_ad_id: string | null;
  status: string | null;
}

export async function loadCampaignAds(
  svc: ServiceClient,
  workspaceId: string,
  campaignId: string,
): Promise<{ id: string; metaAdId: string; status: string | null }[]> {
  const rows = unwrap<AdRow[]>(
    await svc
      .from('ads')
      .select('id, meta_ad_id, status')
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId)
      .order('id', { ascending: true }),
  );
  return rows.flatMap((row) =>
    row.meta_ad_id === null ? [] : [{ id: row.id, metaAdId: row.meta_ad_id, status: row.status }],
  );
}

/** Lectures de refus restantes pour la passe (limite de débit de Meta, EC-META-10) : chaque `fetchRejection` en consomme une. */
export interface ReadBudget {
  left: number;
}

export function takeRead(budget: ReadBudget | undefined): boolean {
  if (budget === undefined) return true;
  if (budget.left <= 0) return false;
  budget.left -= 1;
  return true;
}

export interface AdsReview {
  /** Plusieurs publicités (test A/B) : la logique « partielle » s'applique. */
  multi: boolean;
  total: number;
  rejected: number;
  /** Une lecture a été sautée faute de budget : le résultat n'est PAS complet (jamais conclure « toutes refusées »). */
  incomplete: boolean;
  /** Refus enregistrés pendant cette lecture (à expliquer). */
  recorded: string[];
}

/**
 * Lit chaque publicité d'une campagne à plusieurs publicités et enregistre les refus nouveaux. Une publicité déjà connue comme
 * refusée (refus ouvert) n'est pas relue chez Meta : on ne multiplie pas les appels à chaque passage.
 */
export async function reviewAds(
  svc: ServiceClient,
  connector: RejectionConnector,
  input: {
    workspaceId: string;
    campaignId: string;
    token: PlatformToken;
    refs: PlatformCampaignRefs;
    budget?: ReadBudget;
  },
): Promise<AdsReview> {
  const ads = await loadCampaignAds(svc, input.workspaceId, input.campaignId);
  if (ads.length < 2) {
    return { multi: false, total: ads.length, rejected: 0, incomplete: false, recorded: [] };
  }

  let rejected = 0;
  let incomplete = false;
  const recorded: string[] = [];
  for (const ad of ads) {
    if (await hasOpenRejection(svc, input.workspaceId, input.campaignId, ad.id)) {
      rejected += 1;
      continue;
    }
    if (!takeRead(input.budget)) {
      incomplete = true;
      continue;
    }
    const result = await recordRejection(svc, connector, { ...input, ad });
    if (result === null) continue;
    rejected += 1;
    if (result.created) recorded.push(result.id);
  }
  return { multi: true, total: ads.length, rejected, incomplete, recorded };
}
