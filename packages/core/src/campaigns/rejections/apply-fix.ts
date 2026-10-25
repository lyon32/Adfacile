// POST …/rejections/{id}/apply-fix : « Appliquer la correction et republier » (APPFLOW §12, EC-CAMP-07).
//
// Remplace le texte refusé par la correction du Modérateur puis republie la MÊME campagne par le chemin de publication habituel
// (`publishCampaign` : `rejected → publishing`, tâche `campaign.publish`). Conséquences voulues :
//  - AUCUN quota de campagnes n'est décompté : aucun point d'accroche de quota n'est transmis, et la campagne l'a déjà décompté
//    à sa première publication (TR-PLA-09) ;
//  - c'est une écriture chez Meta qui peut dépenser : bloquée tant que la publication réelle n'est pas activée (interrupteur
//    `PUBEKA_META_PUBLISH`), sauf avec la fausse Meta ; jamais relancée d'office (EC-META-05) ; `Idempotency-Key` obligatoire :
//    la même clé rejouée rend l'état actuel sans republier une deuxième fois ;
//  - le texte n'est écrit qu'avec le passage en « publication » : si la republication est refusée (validation), rien n'a bougé.
//
// Refus PARTIEL d'un test A/B (EC-META-06) : la campagne continue avec l'autre publicité, donc elle n'est pas « refusée » et ne
// repart pas en publication. Remplacer le texte d'une seule publicité chez Meta n'existe pas encore dans le connecteur : on le
// dit (409 `partial_rejection`) au lieu de republier toute la campagne.
import { isFixableCopyField } from '@pubeka/agents';
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../../context';
import { assertRole, assertWritable } from '../../workspaces/guards';
import { copySchema, readJson, type AdCopy } from '../campaign-schemas';
import { nextCampaignStatus } from '../campaign-state';
import { toCampaignView, type CampaignView } from '../campaign-view';
import { loadCostContext } from '../cost-context';
import { assertMetaPublishEnabled } from '../publish/publish-switch';
import { publishCampaign } from '../publish/publish-campaign';
import { loadPublishRow } from '../publish/publish-row';
import type { PublishCampaignDeps } from '../publish/publish-types';
import { isPartial, loadRejectionRow, readStoredReport } from './rejection-view';

function conflict(reason: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError('conflict', { meta: { reason, ...extra } });
}

export interface ApplyFixInput {
  /** `Idempotency-Key` de la requête : une clé = une republication, jamais deux. */
  idempotencyKey: string;
}

export async function applyRejectionFix(
  ctx: MemberCtx,
  campaignId: string,
  rejectionId: string,
  input: ApplyFixInput,
  deps: PublishCampaignDeps,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  // Republier = écrire chez Meta : même interrupteur que la publication.
  assertMetaPublishEnabled(deps);

  const workspaceId = ctx.workspace.id;
  const campaign = await loadPublishRow(ctx.db, workspaceId, campaignId);
  const rejection = await loadRejectionRow(ctx.db, workspaceId, campaignId, rejectionId);

  // Rejeu de la même clé : la correction est déjà partie. On rend l'état actuel (jamais une deuxième republication) et on
  // s'assure que le refus est bien marqué comme corrigé (le processus a pu s'interrompre entre les deux écritures).
  if (campaign.publish_idempotency_key === input.idempotencyKey && campaign.status !== 'rejected') {
    if (!rejection.fixed_and_republished) await markFixed(ctx, rejectionId);
    return toCampaignView(campaign, await loadCostContext(ctx));
  }
  if (rejection.fixed_and_republished) throw conflict('already_fixed');

  if (rejection.explain_status !== 'ready') {
    throw conflict('rejection_not_explained', { explain_status: rejection.explain_status });
  }
  const report = readStoredReport(rejection.report);
  if (report === null) throw conflict('rejection_not_explained', { explain_status: 'failed' });

  if (isPartial(rejection, { campaignStatus: campaign.status, variant: null })) {
    throw conflict('partial_rejection', { status: campaign.status });
  }
  if (!report.can_fix) throw conflict('fix_not_applicable', { reason: 'product_not_allowed' });
  const fix = report.fix;
  if (fix === null) throw conflict('fix_not_applicable', { reason: 'no_fix' });
  if (!isFixableCopyField(fix.field)) {
    // Visuel ou page de destination : le client la corrige lui-même (« Modifier moi-même »).
    throw conflict('fix_not_applicable', { reason: 'field_not_text', field: fix.field });
  }
  if (!nextCampaignStatus(campaign.status, 'publish').ok || campaign.status !== 'rejected') {
    throw conflict('invalid_transition', { status: campaign.status });
  }

  const current = readJson(copySchema, campaign.copy, {});
  const copy: AdCopy = { ...current, [fix.field]: fix.suggested };

  // Aucun point d'accroche de quota : une republication après refus ne décompte rien (EC-CAMP-07).
  const republished = await publishCampaign(
    ctx,
    campaignId,
    { idempotencyKey: input.idempotencyKey, acceptLiability: false, copy },
    { jobs: deps.jobs, metaPublishEnabled: deps.metaPublishEnabled },
  );
  await markFixed(ctx, rejectionId);
  return republished;
}

async function markFixed(ctx: MemberCtx, rejectionId: string): Promise<void> {
  const written = await ctx.svc
    .from('rejections')
    .update({ fixed_and_republished: true })
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', rejectionId);
  if (written.error !== null) throw new AppError('internal_error', { cause: written.error });
}
