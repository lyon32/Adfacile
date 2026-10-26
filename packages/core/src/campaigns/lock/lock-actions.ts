// Actions du CLIENT sur toutes ses publicités à la fois (S19b, APPFLOW §19, TR-PAY-07) :
//  - `pauseAllCampaigns` (bouton « Mettre toutes mes publicités en pause », permis en grâce ET verrouillé comme la pause d'une campagne) ;
//  - `resumeLockedCampaigns` (bouton « Reprendre mes pubs », après le renouvellement).
//
// Reprise : elle ne reprend QUE les campagnes mises en pause par le verrouillage (`pause_reason = billing_lock`), jamais celles que le
// client avait mises en pause lui-même (décision de la personne, 26/10/2026). Reprendre ACTIVE chez Meta, donc dépense : espace
// modifiable (actif), interrupteur `PUBEKA_META_PUBLISH` vérifié avant le premier appel, et chaque campagne passe par `resumeCampaign`
// (Meta d'abord, Page dans la formule, statut relu). Un échec sur une campagne ne bloque pas les autres. Jamais de relance automatique
// d'une activation au résultat incertain (EC-META-05) : `resumeCampaign` relit l'état au lieu de rejouer l'ordre.
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { MemberCtx } from '../../context';
import { assertRole, assertWritable } from '../../workspaces/guards';
import { assertMetaPublishEnabled } from '../publish/publish-switch';
import { resumeCampaign, type CampaignControlDeps } from '../publish/campaign-control';
import { metaRateLimitScope } from '../sync/meta-limits';
import {
  BILLING_LOCK_REASON,
  PAUSE_PER_WORKSPACE_MAX,
  pauseWorkspaceCampaigns,
  type LockPauseDeps,
  type PauseFailure,
} from './pause-workspace';

/** Campagnes traitées au plus par requête (chacune coûte des appels à Meta : la route a `maxDuration` 120 s). Le client reclique pour la suite. */
export const ACTION_BATCH = 10;

export interface PauseAllResult {
  paused: number;
  failed: PauseFailure[];
  rate_limited: boolean;
  /** Des campagnes restent à traiter : le lot de la requête est plein, cliquer encore. */
  more: boolean;
}

export interface ResumeAllResult {
  resumed: number;
  failed: PauseFailure[];
  /** Campagnes encore en pause à cause du verrouillage après cet appel (à reprendre au prochain clic). */
  remaining: number;
  rate_limited: boolean;
  /** Des campagnes restent à reprendre : le lot de la requête est plein, cliquer encore. */
  more: boolean;
}

/**
 * Met en pause toutes les campagnes vivantes de l'espace. Propriétaire ou éditeur ; PAS de `assertWritable` (comme la pause d'une
 * campagne : le client doit toujours pouvoir arrêter de dépenser). Quand l'espace est verrouillé, le motif `billing_lock` est posé
 * (la reprise pourra les retrouver) ; en grâce ou actif, c'est une pause du client, sans motif.
 */
export async function pauseAllCampaigns(
  ctx: MemberCtx,
  deps: LockPauseDeps,
): Promise<PauseAllResult> {
  assertRole(ctx, ['owner', 'editor']);
  const report = await pauseWorkspaceCampaigns(ctx, deps, ctx.workspace.id, {
    source: 'user',
    reason: ctx.workspace.access === 'locked' ? BILLING_LOCK_REASON : null,
    budget: { left: ACTION_BATCH },
  });
  return {
    paused: report.paused,
    failed: report.failed,
    rate_limited: report.rate_limited,
    more: report.budget_exhausted,
  };
}

async function countLocked(ctx: MemberCtx): Promise<number> {
  const rows = unwrap<{ id: string }[]>(
    await ctx.db
      .from('campaigns')
      .select('id')
      .eq('workspace_id', ctx.workspace.id)
      .eq('status', 'paused')
      .eq('pause_reason', BILLING_LOCK_REASON)
      .limit(PAUSE_PER_WORKSPACE_MAX + 1),
  );
  return rows.length;
}

async function stillLocked(ctx: MemberCtx, campaignId: string): Promise<boolean> {
  const rows = unwrap<{ id: string }[]>(
    await ctx.db
      .from('campaigns')
      .select('id')
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', campaignId)
      .eq('status', 'paused')
      .eq('pause_reason', BILLING_LOCK_REASON)
      .limit(1),
  );
  return rows.length > 0;
}

/** Reprend les campagnes mises en pause par le verrouillage. Propriétaire ou éditeur, espace ACTIF, interrupteur de publication. */
export async function resumeLockedCampaigns(
  ctx: MemberCtx,
  deps: CampaignControlDeps,
): Promise<ResumeAllResult> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  // Reprendre = ACTIVER chez Meta (dépense réelle) : refusé AVANT tout appel quand l'interrupteur est désactivé.
  assertMetaPublishEnabled(deps);
  const candidates = unwrap<{ id: string; name: string }[]>(
    await ctx.db
      .from('campaigns')
      .select('id, name')
      .eq('workspace_id', ctx.workspace.id)
      .eq('status', 'paused')
      .eq('pause_reason', BILLING_LOCK_REASON)
      .order('created_at', { ascending: true })
      .limit(ACTION_BATCH + 1),
  );
  const result: ResumeAllResult = {
    resumed: 0,
    failed: [],
    remaining: 0,
    rate_limited: false,
    more: candidates.length > ACTION_BATCH,
  };
  for (const candidate of candidates.slice(0, ACTION_BATCH)) {
    // Le motif est RELU juste avant chaque reprise : si le client a repris puis remis en pause cette campagne lui-même entre-temps, elle
    // n'a plus le motif du verrouillage et n'est pas touchée.
    if (!(await stillLocked(ctx, candidate.id))) continue;
    try {
      await resumeCampaign(ctx, candidate.id, deps);
      result.resumed += 1;
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'internal_error';
      result.failed.push({ campaign_id: candidate.id, name: candidate.name, code });
      if (metaRateLimitScope(error) !== null) {
        result.rate_limited = true;
        break;
      }
    }
  }
  result.remaining = await countLocked(ctx);
  return result;
}
