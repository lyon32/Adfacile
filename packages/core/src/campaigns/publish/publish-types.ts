// Types communs de la publication (S16) : la route `publish` (cas d'usage `publishCampaign`) et la tâche `campaign.publish`
// (`runPublication`) se partagent la tâche, la clé d'idempotence, les points d'accroche du quota et les colonnes lues.
import { z } from 'zod';
import type { JobEnqueuer } from '../../analysis/deps';
import type { CampaignStatus } from '../campaign-state';
import type { CampaignRow } from '../campaign-view';

/** Identifiant de la tâche de fond (CONVENTIONS §9) ; la clé d'idempotence est `campaign.publish:{id}:{tentative}`. */
export const PUBLISH_TASK = 'campaign.publish';

export const publishPayloadSchema = z.strictObject({
  campaignId: z.uuid(),
  workspaceId: z.uuid(),
});
export type PublishPayload = z.infer<typeof publishPayloadSchema>;

export function publishIdempotencyKey(campaignId: string, attempt: number): string {
  return `${PUBLISH_TASK}:${campaignId}:${String(attempt)}`;
}

/**
 * Points d'accroche du quota de campagnes (S24 les remplira). Même discipline que pour l'Analyste et le Stratège :
 *  - `beforeSpend` : APRÈS toute la validation et AVANT le passage en `publishing` ; une erreur (`campaign_quota_reached`)
 *    arrête tout, rien n'est modifié. Jamais appelé pour une republication après refus (EC-CAMP-07, TR-PLA-09) ;
 *  - `afterAccepted` : seulement quand Meta a reçu la campagne (`publishing → in_review`) ; c'est là que S24 décompte ;
 *  - `release` : rend ce que `beforeSpend` a réservé quand la publication échoue ; jamais appelé si `beforeSpend` a refusé.
 */
export interface PublishHooks {
  beforeSpend?: (campaignId: string, workspaceId: string) => Promise<void>;
  afterAccepted?: (campaignId: string, workspaceId: string) => Promise<void>;
  release?: (campaignId: string, workspaceId: string) => Promise<void>;
}

/** Ce dont la route a besoin : lancer la tâche et les points d'accroche. Aucun appel à Meta dans la route. */
export interface PublishCampaignDeps extends PublishHooks {
  jobs: JobEnqueuer;
}

// Liste écrite en toutes lettres (et non composée) : le client Supabase en déduit le type des lignes à la compilation.
export const PUBLISH_COLUMNS =
  'id, workspace_id, page_id, ad_account_id, analysis_id, name, platform, objective, destination, optimization_goal, geo, targeting, daily_budget_usd_cents, fx_rate_xaf, start_date, end_date, copy, tracking, visual_brief, ab_test, status, published_at, editable, chosen_proposal_version, version, paused_at, publish_error, meta_campaign_id, meta_adset_id, publish_ref, publish_attempt, publish_idempotency_key, publish_phase, publish_started_at, quota_state';

export type PublishPhase = 'none' | 'creating' | 'created' | 'activating' | 'done';
export type QuotaState = 'none' | 'held' | 'counted' | 'released';

export interface PublishRow extends CampaignRow {
  status: CampaignStatus;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  publish_ref: string | null;
  publish_attempt: number;
  publish_idempotency_key: string | null;
  publish_phase: PublishPhase;
  publish_started_at: string | null;
  quota_state: QuotaState;
}

/** Référence de rapprochement : « pk-<12 derniers caractères hexadécimaux de l'identifiant>-<tentative> » (migration 0014). */
export function publishRef(campaignId: string, attempt: number): string {
  return `${publishRefBase(campaignId)}-${String(attempt)}`;
}

/** Partie commune à toutes les tentatives d'une campagne : sert à retrouver aussi les restes d'une tentative précédente. */
export function publishRefBase(campaignId: string): string {
  return `pk-${campaignId.replaceAll('-', '').slice(-12).toLowerCase()}`;
}
