// Identifiants d'une campagne chez Meta, relus en base : la campagne et l'ensemble sont sur `campaigns`, la publicité et sa
// création dans `ads`. Partagé par la tâche de publication et par la pause, la reprise et la relance.
import { unwrap, type DbClient } from '@pubeka/db';
import type { PlatformCampaignRefs } from '@pubeka/platforms';
import type { PublishRow } from './publish-types';

export async function loadRefs(
  reader: DbClient,
  row: Pick<PublishRow, 'id' | 'workspace_id' | 'meta_campaign_id' | 'meta_adset_id'>,
  adAccountId: string,
): Promise<PlatformCampaignRefs | null> {
  if (row.meta_campaign_id === null) return null;
  const ad = unwrap<{ meta_ad_id: string | null; meta_creative_id: string | null } | null>(
    await reader
      .from('ads')
      .select('meta_ad_id, meta_creative_id')
      .eq('workspace_id', row.workspace_id)
      .eq('campaign_id', row.id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle(),
  );
  return {
    campaignId: row.meta_campaign_id,
    adsetId: row.meta_adset_id,
    adId: ad?.meta_ad_id ?? null,
    creativeId: ad?.meta_creative_id ?? null,
    adAccountId,
  };
}
