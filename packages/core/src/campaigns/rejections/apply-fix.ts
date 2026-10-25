// POST …/rejections/{id}/apply-fix : « Appliquer la correction et republier » (APPFLOW §12, EC-CAMP-07).
//
// Remplace le texte refusé par la correction du Modérateur puis republie la MÊME campagne par le chemin de publication habituel
// (`publishCampaign` : `rejected → publishing`, tâche `campaign.publish`). Conséquences voulues :
//  - AUCUN quota de campagnes n'est décompté ni retenu : aucun point d'accroche n'est transmis et `publishCampaign` ne retient
//    rien quand des textes de remplacement sont fournis (la campagne a déjà été décomptée, TR-PLA-09) ;
//  - c'est une écriture chez Meta qui peut dépenser : bloquée tant que la publication réelle n'est pas activée (interrupteur
//    `PUBEKA_META_PUBLISH`), sauf avec la fausse Meta ; jamais relancée d'office (EC-META-05) ; `Idempotency-Key` obligatoire ;
//  - AVANT d'écrire quoi que ce soit, le statut de la campagne est RELU chez Meta (lecture seule) : si elle n'est plus refusée
//    (le client a pu gagner son appel et elle diffuse), la correction est refusée (409 `no_longer_rejected`) ; la tâche relit
//    encore avant de supprimer et de créer (voir run-publication.ts) ;
//  - le texte n'est écrit qu'avec le passage en « publication » : si la republication est refusée (validation), rien n'a bougé ;
//  - le refus n'est marqué « corrigé » que par la tâche, quand Meta a reçu la nouvelle campagne.
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
import { readMetaStatus, type CampaignControlDeps } from '../publish/campaign-control';
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

/** Publication (tâche, interrupteur) et lecture du statut chez Meta (jamais d'écriture ici). */
export interface RejectionFixDeps extends PublishCampaignDeps {
  meta: CampaignControlDeps;
}

export async function applyRejectionFix(
  ctx: MemberCtx,
  campaignId: string,
  rejectionId: string,
  input: ApplyFixInput,
  deps: RejectionFixDeps,
): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  // Republier = écrire chez Meta : même interrupteur que la publication.
  assertMetaPublishEnabled(deps);

  const workspaceId = ctx.workspace.id;
  const campaign = await loadPublishRow(ctx.db, workspaceId, campaignId);
  const rejection = await loadRejectionRow(ctx.db, workspaceId, campaignId, rejectionId);

  const retryable = campaign.status === 'rejected' || campaign.status === 'error';
  if (campaign.publish_idempotency_key === input.idempotencyKey) {
    // Rejeu de la même clé après une correction partie : on rend l'état actuel, jamais une deuxième republication.
    if (!retryable) return toCampaignView(campaign, await loadCostContext(ctx));
    // La même clé sur une campagne encore refusée est celle d'une AUTRE publication (l'originale) : jamais réutilisable ici.
    throw new AppError('idempotency_key_reused');
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
  if (!report.can_fix) throw conflict('fix_not_applicable', { cause: 'product_not_allowed' });
  const fix = report.fix;
  if (fix === null) throw conflict('fix_not_applicable', { cause: 'no_fix' });
  if (!isFixableCopyField(fix.field)) {
    // Visuel ou page de destination : le client la corrige lui-même (« Modifier moi-même »).
    throw conflict('fix_not_applicable', { cause: 'field_not_text', field: fix.field });
  }
  if (!retryable || !nextCampaignStatus(campaign.status, 'publish').ok) {
    throw conflict('invalid_transition', { status: campaign.status });
  }

  // Meta fait foi : si l'ancienne campagne existe encore chez Meta, elle doit y être toujours refusée. Sinon (appel gagné, elle
  // diffuse ou est en vérification), on ne touche à rien. Une lecture en échec est une erreur claire, rien n'est écrit.
  if (campaign.meta_campaign_id !== null) {
    const remote = await readMetaStatus(ctx, campaignId, deps.meta);
    if (remote.status !== 'rejected') {
      throw conflict('no_longer_rejected', { raw_status: remote.rawStatus });
    }
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
  // `publishCampaign` rend l'état actuel SANS republier quand la clé est celle d'une publication précédente : on ne dit jamais
  // « republiée » si la campagne n'est pas repartie.
  if (republished.status !== 'publishing') throw new AppError('idempotency_key_reused');
  return republished;
}
