// Événements de statut envoyés par Meta (EC-META-08, EC-META-09). Meta fait foi pour le statut,
// le budget et les dates : un webhook n'est qu'un signal. On l'enregistre dans le journal des
// statuts de la campagne concernée (source « webhook ») ; la synchronisation (S17) relit chez Meta
// et décide. Un objet inconnu de Pubeka est ignoré (200).
import { check, recordWebhookEvent, unwrap, type Json } from '@pubeka/db';
import type { ServiceCtx } from '../context';

export interface MetaStatusEvent {
  kind: 'in_process' | 'with_issues';
  adAccountId: string;
  /** Identifiant chez Meta de la campagne, de l'ensemble ou de la publicité concernée. */
  objectId: string;
  level: string | null;
  detail: Record<string, string | null>;
}

export interface WebhookOutcome {
  duplicate: boolean;
  recorded: number;
  unknown: number;
}

const META_ID = /^[0-9]{5,25}$/;

interface Target {
  workspaceId: string;
  campaignId: string;
  adId: string | null;
}

interface CampaignRef {
  id: string;
  workspace_id: string;
}

async function findTarget(ctx: ServiceCtx, objectId: string): Promise<Target | null> {
  if (!META_ID.test(objectId)) return null;
  const campaign = unwrap<CampaignRef | null>(
    await ctx.svc
      .from('campaigns')
      .select('id, workspace_id')
      .eq('meta_campaign_id', objectId)
      .maybeSingle(),
  );
  if (campaign !== null) {
    return { workspaceId: campaign.workspace_id, campaignId: campaign.id, adId: null };
  }
  const adset = unwrap<CampaignRef | null>(
    await ctx.svc
      .from('campaigns')
      .select('id, workspace_id')
      .eq('meta_adset_id', objectId)
      .maybeSingle(),
  );
  if (adset !== null) return { workspaceId: adset.workspace_id, campaignId: adset.id, adId: null };
  const ad = unwrap<{ id: string; workspace_id: string; campaign_id: string } | null>(
    await ctx.svc
      .from('ads')
      .select('id, workspace_id, campaign_id')
      .eq('meta_ad_id', objectId)
      .maybeSingle(),
  );
  return ad === null
    ? null
    : { workspaceId: ad.workspace_id, campaignId: ad.campaign_id, adId: ad.id };
}

/**
 * Enregistre les événements d'une notification déjà authentifiée (signature vérifiée par l'appelant).
 * `eventId` : empreinte du corps ; un événement déjà vu ne refait rien (SECURITY_NOTES §3.4 règle 3).
 */
export async function recordMetaStatusEvents(
  ctx: ServiceCtx,
  eventId: string,
  events: readonly MetaStatusEvent[],
): Promise<WebhookOutcome> {
  if (!(await recordWebhookEvent(ctx.svc, 'meta', eventId))) {
    return { duplicate: true, recorded: 0, unknown: 0 };
  }
  let recorded = 0;
  let unknown = 0;
  for (const event of events) {
    const target = await findTarget(ctx, event.objectId);
    if (target === null) {
      unknown += 1;
      continue;
    }
    const payload: Json = { level: event.level, ...event.detail };
    check(
      await ctx.svc.from('campaign_status_events').insert({
        workspace_id: target.workspaceId,
        campaign_id: target.campaignId,
        ad_id: target.adId,
        status: event.kind,
        source: 'webhook',
        payload,
      }),
    );
    recorded += 1;
  }
  return { duplicate: false, recorded, unknown };
}
