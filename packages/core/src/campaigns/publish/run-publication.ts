// Tâche `campaign.publish` : crée la campagne chez Meta, l'active, puis la passe en `in_review` (LLD §6.8).
//
// RÈGLE ABSOLUE (CLAUDE.md §3, SECURITY_NOTES EC-META-05) : un résultat INCERTAIN n'est jamais relancé automatiquement. Après un
// délai, une coupure ou une réponse illisible, la tâche ne recrée rien : elle LIT d'abord chez Meta ce qui existe (campagne dont le
// nom porte la référence de publication, écrite en base AVANT le premier appel), puis décide de façon déterministe :
//   - la campagne existe et est complète → on l'ADOPTE (ses identifiants sont enregistrés) et on continue ;
//   - elle existe, incomplète → on la supprime (en pause, aucune dépense) et on conclut « échec incertain » ;
//   - rien n'existe ET la liste a été lue en entier → on conclut « échec incertain » ; l'utilisateur republie volontairement ;
//   - la lecture échoue ou la liste est coupée → on ne conclut PAS : la campagne reste « en publication » (« on vérifie ») et la
//     tâche peut être rejouée sans rien créer de plus (la phase est enregistrée).
// Les restes d'une tentative précédente (même campagne Pubeka, autre numéro de tentative) sont supprimés : ils sont en pause.
//
// Une campagne est créée EN PAUSE partout (connecteur) ; elle n'est ACTIVÉE (donc susceptible de dépenser) qu'une fois ses
// identifiants enregistrés chez Pubeka. L'activation incertaine est lue (`getStatus`), jamais rejouée.
//
// Idempotence : la phase (`none → creating → created → activating → done`) est avancée par des écritures gardées ; deux
// exécutions simultanées ou une tâche rejouée ne créent jamais deux campagnes. Aucun jeton n'est journalisé.
import { AppError, type ErrorCode } from '@pubeka/contracts';
import { publishDisabledError, type MetaPublishGate } from './publish-switch';
import { check, unwrap, type ServiceClient } from '@pubeka/db';
import {
  assertValidCampaign,
  isAmbiguousMetaFailure,
  nameHasReference,
  toAppError,
  type PlatformCampaignRefs,
  type PlatformConnector,
  type PlatformToken,
  type RemoteCampaign,
} from '@pubeka/platforms';
import { createLogger } from '@pubeka/shared';
import type { ServiceCtx } from '../../context';
import { pagePlanOf } from '../../meta/plan';
import {
  copySchema,
  geoSchema,
  readJson,
  targetingSchema,
  trackingSchema,
} from '../campaign-schemas';
import { loadAccountCurrency } from './account-rate';
import { buildPublishSpec } from './build-spec';
import { failPublication } from './fail-publication';
import { loadPublishInputs, type PublishInputs } from './load-inputs';
import { resolveLocations } from './locations';
import { assertPageInPlan } from './page-guard';
import { assertMetaReady } from './publish-campaign';
import { loadPublishRow } from './publish-row';
import {
  publishRefBase,
  publishPayloadSchema,
  type PublishHooks,
  type PublishPayload,
  type PublishRow,
} from './publish-types';
import { classifyPreviousCampaign } from './previous-campaign';
import { loadRefs } from './remote-refs';
import { applyTransition, recordStatusEvent, updateWhilePublishing } from './transitions';

const logger = createLogger({ base: { module: 'run-publication' } });

/** Ce que la tâche demande au connecteur : jamais plus. */
export type PublishConnector = Pick<
  PlatformConnector,
  | 'createCampaign'
  | 'resume'
  | 'deleteCampaign'
  | 'getStatus'
  | 'findCampaignsByReference'
  | 'searchLocations'
>;

export interface RunPublicationDeps extends PublishHooks, MetaPublishGate {
  connector: PublishConnector;
  /** Jeton Meta DÉCHIFFRÉ de la connexion, lu côté serveur seulement (jamais journalisé). */
  loadToken: (
    svc: ServiceClient,
    workspaceId: string,
    connection: { id: string; expiresAt: Date | null },
  ) => Promise<PlatformToken>;
  /** Durée de l'adresse signée de la photo, en secondes (Meta la télécharge pendant la création). Défaut : 1 heure. */
  mediaUrlTtlSeconds?: number;
}

export type PublicationOutcome =
  | { outcome: 'skipped'; reason: 'not_found' | 'not_publishing' | 'already_running' | 'done' }
  | { outcome: 'accepted'; adopted: boolean }
  | { outcome: 'failed'; code: ErrorCode; uncertain: boolean }
  | {
      outcome: 'pending';
      reason: 'lookup_failed' | 'lookup_incomplete' | 'activation_unknown' | 'publish_disabled';
    };

interface Run {
  svc: ServiceClient;
  ctx: ServiceCtx;
  deps: RunPublicationDeps;
  row: PublishRow;
  inputs: PublishInputs;
  token: PlatformToken;
  adAccountId: string;
  /** Faux quand l'interrupteur de publication réelle est désactivé : lectures et rapprochement permis, aucune ACTIVATION. */
  canActivate: boolean;
}

function accountOf(inputs: PublishInputs): string {
  if (inputs.adAccount === null) throw new AppError('meta_not_connected');
  return inputs.adAccount.metaAdAccountId;
}

async function ownerCountry(svc: ServiceClient, workspaceId: string): Promise<string | null> {
  const ws = unwrap<{ owner_id: string } | null>(
    await svc.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle(),
  );
  if (ws === null) return null;
  const profile = unwrap<{ country_code: string | null } | null>(
    await svc.from('profiles').select('country_code').eq('id', ws.owner_id).maybeSingle(),
  );
  return profile?.country_code ?? null;
}

/** Adresse signée de la photo : Meta la télécharge pendant la création (hôte du stockage de Pubeka seulement, anti-SSRF). */
async function signedPhotoUrl(run: Run): Promise<string> {
  const visual = run.inputs.visual;
  if (visual === null) {
    throw new AppError('validation_failed', {
      errors: [
        { field: 'visual', code: 'required', message: 'Ajoute une photo : la pub en a besoin.' },
      ],
    });
  }
  const signed = await run.svc.storage
    .from(visual.bucket)
    .createSignedUrl(visual.filePath, run.deps.mediaUrlTtlSeconds ?? 3600);
  if (signed.error !== null) {
    // Fichier supprimé entre la route et la tâche : le même 410 que la route (EC-CAMP-06).
    throw new AppError('gone', { meta: { reason: 'visual_expired' }, cause: signed.error });
  }
  return signed.data.signedUrl;
}

async function buildSpec(run: Run) {
  const { row, inputs } = run;
  if (inputs.page === null || inputs.adAccount === null) throw new AppError('meta_not_connected');
  const account = await loadAccountCurrency(run.svc, inputs.adAccount.currency, run.ctx.now());
  const geo = readJson(geoSchema, row.geo, {});
  const locations = await resolveLocations(
    run.deps.connector,
    run.token,
    geo,
    await ownerCountry(run.svc, row.workspace_id),
  );
  const spec = buildPublishSpec({
    campaign: {
      name: row.name,
      objective: row.objective,
      destination: row.destination,
      optimization_goal: row.optimization_goal,
      geo,
      targeting: readJson(targetingSchema, row.targeting, {}),
      daily_budget_usd_cents: row.daily_budget_usd_cents,
      start_date: row.start_date,
      end_date: row.end_date,
      copy: readJson(copySchema, row.copy, {}),
      tracking: readJson(trackingSchema, row.tracking, null),
    },
    ref: row.publish_ref ?? '',
    page: inputs.page,
    adAccount: inputs.adAccount,
    account,
    website: inputs.business.website,
    mediaUrl: await signedPhotoUrl(run),
    locations,
  });
  try {
    assertValidCampaign(spec);
  } catch (error) {
    throw toAppError(error);
  }
  return spec;
}

const refsOf = (
  campaign: Pick<RemoteCampaign, 'campaignId' | 'adsetId' | 'adId' | 'creativeId'>,
  adAccountId: string,
): PlatformCampaignRefs => ({
  campaignId: campaign.campaignId,
  adsetId: campaign.adsetId,
  adId: campaign.adId,
  creativeId: campaign.creativeId,
  adAccountId,
});

/** Échec définitif : la campagne passe en erreur, le quota retenu est rendu. */
async function fail(run: Run, error: AppError, uncertain = false): Promise<PublicationOutcome> {
  const latest = await loadPublishRow(run.svc, run.row.workspace_id, run.row.id);
  await failPublication(run.svc, run.deps, run.ctx.now(), latest, error, { uncertain });
  return { outcome: 'failed', code: error.code, uncertain };
}

/** Supprime chez Meta ce que cette tâche y a laissé (en pause, sans dépense). Un échec est journalisé, jamais avalé en silence. */
async function removeRemote(run: Run, refs: PlatformCampaignRefs): Promise<boolean> {
  try {
    await run.deps.connector.deleteCampaign(run.token, refs);
    return true;
  } catch (error) {
    logger.error('Campagne laissée chez Meta après un échec de publication', {
      campaignId: run.row.id,
      metaCampaignId: refs.campaignId,
      err: error,
    });
    return false;
  }
}

/**
 * Oublie les identifiants Meta de la campagne ET de ses publicités quand la campagne correspondante n'existe plus chez Meta. Les
 * lignes de publicité sont gardées (leurs statistiques y sont rattachées en CASCADE) : seuls leurs identifiants Meta sont vidés.
 */
async function forgetLocalRefs(run: Run): Promise<void> {
  const { row } = run;
  const emptied = await run.svc
    .from('ads')
    .update({ meta_ad_id: null, meta_creative_id: null, status: 'paused' })
    .eq('workspace_id', row.workspace_id)
    .eq('campaign_id', row.id);
  if (emptied.error !== null) throw new AppError('internal_error', { cause: emptied.error });
  const cleared = await run.svc
    .from('campaigns')
    .update({ meta_campaign_id: null, meta_adset_id: null })
    .eq('workspace_id', row.workspace_id)
    .eq('id', row.id)
    .eq('status', 'publishing');
  if (cleared.error !== null) throw new AppError('internal_error', { cause: cleared.error });
  run.row.meta_campaign_id = null;
  run.row.meta_adset_id = null;
}

/** Supprime chez Meta puis, si cela a réussi, oublie les identifiants locaux : un échec ne laisse jamais un identifiant mort en base. */
async function removeRemoteAndForget(run: Run, refs: PlatformCampaignRefs): Promise<boolean> {
  if (!(await removeRemote(run, refs))) return false;
  try {
    await forgetLocalRefs(run);
  } catch (error) {
    logger.error('Identifiants locaux non effacés après suppression chez Meta', {
      campaignId: run.row.id,
      err: error,
    });
  }
  return true;
}

/** Enregistre les identifiants de Meta, puis la publicité (une ligne par publicité Meta). */
async function persistRefs(
  run: Run,
  refs: PlatformCampaignRefs,
  from: 'creating',
): Promise<boolean> {
  const updated = await updateWhilePublishing(
    run.svc,
    run.row,
    { meta_campaign_id: refs.campaignId, meta_adset_id: refs.adsetId, publish_phase: 'created' },
    { phase: from },
  );
  if (updated === null) return false;
  if (refs.adId !== null) {
    // Republication d'une campagne refusée : la ligne de publicité « vidée » est RÉUTILISÉE (les statistiques par publicité lui sont
    // rattachées en CASCADE : la supprimer les perdrait) ; sinon, une ligne neuve.
    const emptied = unwrap<{ id: string }[]>(
      await run.svc
        .from('ads')
        .select('id')
        .eq('workspace_id', run.row.workspace_id)
        .eq('campaign_id', run.row.id)
        .is('meta_ad_id', null)
        .order('id', { ascending: true })
        .limit(1),
    );
    const reused = emptied[0];
    const written =
      reused === undefined
        ? await run.svc.from('ads').insert({
            workspace_id: run.row.workspace_id,
            campaign_id: run.row.id,
            meta_ad_id: refs.adId,
            meta_creative_id: refs.creativeId,
            format: '4:5',
            status: 'paused',
          })
        : await run.svc
            .from('ads')
            .update({ meta_ad_id: refs.adId, meta_creative_id: refs.creativeId, status: 'paused' })
            .eq('workspace_id', run.row.workspace_id)
            .eq('id', reused.id);
    // 23505 : déjà enregistrée par une exécution précédente, sans conséquence.
    if (written.error !== null && written.error.code !== '23505') {
      throw new AppError('internal_error', { cause: written.error });
    }
  }
  return true;
}

/** Meta montre la campagne en diffusion ou en vérification : aucun ordre d'activation n'est nécessaire. */
function isLiveRemotely(effectiveStatus: string): boolean {
  return ['ACTIVE', 'PENDING_REVIEW', 'PREAPPROVED', 'IN_PROCESS', 'IN_REVIEW'].includes(
    effectiveStatus.toUpperCase(),
  );
}

/** Cherche chez Meta ce qui existe pour cette campagne Pubeka, adopte ou nettoie. Voir l'en-tête du fichier. */
async function reconcile(
  run: Run,
  uncertainCause: AppError | undefined,
): Promise<PublicationOutcome> {
  const { connector } = run.deps;
  let lookup;
  try {
    lookup = await connector.findCampaignsByReference(
      run.token,
      run.adAccountId,
      publishRefBase(run.row.id),
    );
  } catch (error) {
    logger.warn('Rapprochement impossible : la campagne reste en publication', {
      campaignId: run.row.id,
      err: error,
    });
    return { outcome: 'pending', reason: 'lookup_failed' };
  }
  const ref = run.row.publish_ref ?? '';
  const mine = lookup.campaigns.filter((c) => nameHasReference(c.name, ref));
  const orphans = lookup.campaigns.filter((c) => !mine.includes(c));
  // Restes d'une tentative précédente : en pause (jamais activés), supprimés. Un reste déjà actif n'est pas touché.
  for (const orphan of orphans) {
    if (orphan.effectiveStatus === 'PAUSED')
      await removeRemote(run, refsOf(orphan, run.adAccountId));
    else
      logger.error('Campagne d’une tentative précédente non en pause : laissée en place', {
        campaignId: run.row.id,
      });
  }

  const complete = mine.find((c) => c.adsetId !== null && c.adId !== null);
  if (complete !== undefined) {
    for (const extra of mine.filter((c) => c !== complete))
      await removeRemote(run, refsOf(extra, run.adAccountId));
    const refs = refsOf(complete, run.adAccountId);
    if (!(await persistRefs(run, refs, 'creating')))
      return { outcome: 'skipped', reason: 'already_running' };
    return activate(
      { ...run, row: { ...run.row, publish_phase: 'created' } },
      refs,
      true,
      isLiveRemotely(complete.effectiveStatus),
    );
  }
  for (const partial of mine) await removeRemote(run, refsOf(partial, run.adAccountId));
  if (mine.length === 0 && !lookup.exhaustive)
    return { outcome: 'pending', reason: 'lookup_incomplete' };
  // Rien d'exploitable chez Meta : la création n'a pas abouti. Échec « incertain » : l'utilisateur republiera volontairement.
  const error = new AppError('meta_error', {
    meta: { reason: mine.length === 0 ? 'nothing_created' : 'incomplete_creation_removed' },
    ...(uncertainCause === undefined ? {} : { cause: uncertainCause }),
  });
  return fail(run, error, true);
}

/** Activation (dépense possible) puis passage en `in_review`. Une activation incertaine est LUE, jamais rejouée. */
async function activate(
  run: Run,
  refs: PlatformCampaignRefs,
  adopted: boolean,
  alreadyLive = false,
): Promise<PublicationOutcome> {
  const { connector } = run.deps;
  // Interrupteur désactivé : on n'envoie aucun ordre d'activation (la campagne reste en pause chez Meta) ; une campagne que Meta
  // montre DÉJÀ en diffusion n'a pas besoin d'ordre : on reflète son état.
  if (!alreadyLive && !run.canActivate) return { outcome: 'pending', reason: 'publish_disabled' };
  const claimed = await updateWhilePublishing(
    run.svc,
    run.row,
    { publish_phase: 'activating' },
    { phase: 'created' },
  );
  if (claimed === null) return { outcome: 'skipped', reason: 'already_running' };
  const active: Run = { ...run, row: claimed };
  try {
    if (!alreadyLive) await connector.resume(run.token, refs);
    return await accept(active, adopted, 'activating');
  } catch (error) {
    if (!isAmbiguousMetaFailure(error)) {
      // Refus net : rien n'est activé. On retire la campagne créée (en pause), on oublie ses identifiants et on conclut.
      await removeRemoteAndForget(active, refs);
      return fail(active, toAppError(error));
    }
    return resolveActivation(active, refs, adopted, toAppError(error));
  }
}

/** Activation incertaine : on lit l'état chez Meta puis on décide. */
async function resolveActivation(
  run: Run,
  refs: PlatformCampaignRefs,
  adopted: boolean,
  cause: AppError | undefined,
): Promise<PublicationOutcome> {
  let status;
  try {
    status = await run.deps.connector.getStatus(run.token, refs);
  } catch (error) {
    logger.warn('État de la campagne illisible : elle reste en publication', {
      campaignId: run.row.id,
      err: error,
    });
    return { outcome: 'pending', reason: 'activation_unknown' };
  }
  if (status.status === 'paused') {
    // Meta n'a pas activé : on retire la campagne en pause, on oublie ses identifiants et on conclut.
    await removeRemoteAndForget(run, refs);
    return fail(
      run,
      new AppError('meta_error', {
        meta: { reason: 'activation_not_applied' },
        ...(cause === undefined ? {} : { cause }),
      }),
      true,
    );
  }
  if (status.status === 'active' || status.status === 'in_review')
    return accept(run, adopted, 'activating');
  // Refusée, arrêtée, en erreur dès l'activation : on laisse la campagne chez Meta (elle est lisible) et on conclut en erreur.
  return fail(
    run,
    new AppError('meta_error', {
      meta: { reason: `remote_${status.status}` },
      ...(cause === undefined ? {} : { cause }),
    }),
    true,
  );
}

/** Meta a reçu la campagne : `publishing → in_review`, quota décompté, Page verrouillée pour la période. */
async function accept(
  run: Run,
  adopted: boolean,
  phase: 'activating',
): Promise<PublicationOutcome> {
  const now = run.ctx.now();
  const sent = await applyTransition(
    run.svc,
    run.row,
    'sent',
    { published_at: now.toISOString(), publish_phase: 'done', editable: false },
    { phase },
  );
  if (sent === null) return { outcome: 'skipped', reason: 'done' };
  await recordStatusEvent(run.svc, sent, 'in_review', 'user', { adopted });
  // Republication après refus (S18) : le refus n'est « corrigé » que maintenant, quand Meta a reçu la nouvelle campagne.
  const fixed = await run.svc
    .from('rejections')
    .update({ fixed_and_republished: true })
    .eq('workspace_id', sent.workspace_id)
    .eq('campaign_id', sent.id)
    .eq('fixed_and_republished', false);
  if (fixed.error !== null) {
    logger.error('Refus non marqué corrigé', { campaignId: sent.id, code: fixed.error.code });
  }

  if (sent.quota_state === 'held' && run.deps.afterAccepted !== undefined) {
    try {
      await run.deps.afterAccepted(sent.id, sent.workspace_id);
      check(
        await run.svc
          .from('campaigns')
          .update({ quota_state: 'counted' })
          .eq('workspace_id', sent.workspace_id)
          .eq('id', sent.id)
          .eq('quota_state', 'held'),
      );
    } catch (error) {
      // La campagne est partie : le décompte (S24) est à rattraper, il ne défait pas la publication.
      logger.error('Quota non décompté après publication', { campaignId: sent.id, err: error });
    }
  }
  await lockPage(run.svc, sent, now);
  return { outcome: 'accepted', adopted };
}

/** TR-PLA-08 : dès la première campagne de la période, la Page est figée (`first_campaign_at`). Sans période connue : rien. */
async function lockPage(svc: ServiceClient, row: PublishRow, now: Date): Promise<void> {
  if (row.page_id === null) return;
  try {
    const plan = await pagePlanOf(svc, row.workspace_id);
    if (plan.periodStart === null) return;
    const existing = unwrap<{ first_campaign_at: string | null } | null>(
      await svc
        .from('page_activations')
        .select('first_campaign_at')
        .eq('workspace_id', row.workspace_id)
        .eq('page_id', row.page_id)
        .eq('period_start', plan.periodStart)
        .maybeSingle(),
    );
    if (existing === null) {
      check(
        await svc.from('page_activations').insert({
          workspace_id: row.workspace_id,
          page_id: row.page_id,
          period_start: plan.periodStart,
          first_campaign_at: now.toISOString(),
        }),
      );
    } else if (existing.first_campaign_at === null) {
      check(
        await svc
          .from('page_activations')
          .update({ first_campaign_at: now.toISOString() })
          .eq('workspace_id', row.workspace_id)
          .eq('page_id', row.page_id)
          .eq('period_start', plan.periodStart),
      );
    }
  } catch (error) {
    logger.error('Page non figée pour la période', { campaignId: row.id, err: error });
  }
}

/**
 * Republication d'une campagne REFUSÉE (S18, `applyRejectionFix`) : elle repart d'une création neuve. RÈGLE D'ARGENT : la nouvelle
 * campagne n'est créée QUE si l'ancienne n'existe plus chez Meta (supprimée avec succès ou absente) ; sinon deux campagnes pourraient
 * diffuser en même temps. L'ancienne n'est retirée que si Meta la montre refusée ou en pause (relu ICI, juste avant : le client a pu
 * gagner son appel). Tout autre cas échoue net, SANS création et sans relance automatique (EC-META-05), avec une raison que l'écran
 * explique :
 *  - `previous_campaign_still_live` : Meta ne la montre plus refusée (elle diffuse ou est en vérification) ;
 *  - `previous_campaign_unreadable` : son statut n'a pas pu être lu ;
 *  - `previous_campaign_not_removed` : sa suppression a échoué.
 * Les lignes de publicité ne sont jamais supprimées (leurs statistiques y sont rattachées en CASCADE) : après une suppression
 * réussie, elles sont seulement « vidées » de leurs identifiants Meta, puis réutilisées par la nouvelle création.
 */
async function removePreviousAttempt(run: Run): Promise<AppError | null> {
  const { row } = run;
  if (row.meta_campaign_id === null) return null;
  const refs = await loadRefs(run.svc, row, run.adAccountId);
  if (refs === null) return null;
  const blocked = (reason: string): AppError => new AppError('meta_error', { meta: { reason } });
  let state: ReturnType<typeof classifyPreviousCampaign>;
  try {
    state = classifyPreviousCampaign(await run.deps.connector.getStatus(run.token, refs));
  } catch (error) {
    logger.warn('État de l’ancienne campagne illisible : rien n’est créé', {
      campaignId: row.id,
      err: error,
    });
    return blocked('previous_campaign_unreadable');
  }
  if (state === 'live') {
    logger.warn('Ancienne campagne encore vivante chez Meta : rien n’est créé', {
      campaignId: row.id,
    });
    return blocked('previous_campaign_still_live');
  }
  // `removable` : on la supprime d'abord ; `absent` (DELETED ou ARCHIVED chez Meta) : il n'y a rien à supprimer.
  if (state === 'removable' && !(await removeRemote(run, refs))) {
    return blocked('previous_campaign_not_removed');
  }
  await forgetLocalRefs(run);
  return null;
}

/** Création chez Meta : la seule étape qui ne se rejoue pas. */
async function create(run: Run): Promise<PublicationOutcome> {
  const previous = await removePreviousAttempt(run);
  // L'ancienne campagne est toujours chez Meta (ou son état est inconnu) : on ne crée RIEN.
  if (previous !== null) return fail(run, previous);
  const spec = await buildSpec(run);
  const claimed = await updateWhilePublishing(
    run.svc,
    run.row,
    { publish_phase: 'creating' },
    { phase: 'none' },
  );
  if (claimed === null) return { outcome: 'skipped', reason: 'already_running' };
  const active: Run = { ...run, row: claimed };
  let refs: PlatformCampaignRefs;
  try {
    refs = await run.deps.connector.createCampaign(run.token, spec);
  } catch (error) {
    if (!isAmbiguousMetaFailure(error)) return fail(active, toAppError(error));
    return reconcile(active, toAppError(error));
  }
  let saved: boolean;
  try {
    saved = await persistRefs(active, refs, 'creating');
  } catch (error) {
    // Les identifiants ne peuvent pas être enregistrés : on retire la campagne (en pause) plutôt que de la perdre de vue.
    await removeRemoteAndForget(active, refs);
    return fail(
      active,
      error instanceof AppError ? error : new AppError('internal_error', { cause: error }),
    );
  }
  if (!saved) {
    await removeRemote(active, refs);
    return { outcome: 'skipped', reason: 'already_running' };
  }
  return activate({ ...active, row: { ...active.row, publish_phase: 'created' } }, refs, false);
}

export async function runPublication(
  ctx: ServiceCtx,
  payload: PublishPayload,
  deps: RunPublicationDeps,
): Promise<PublicationOutcome> {
  const { campaignId, workspaceId } = publishPayloadSchema.parse(payload);
  const svc = ctx.svc;
  let row: PublishRow;
  try {
    row = await loadPublishRow(svc, workspaceId, campaignId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found')
      return { outcome: 'skipped', reason: 'not_found' };
    throw error;
  }
  if (row.status !== 'publishing') return { outcome: 'skipped', reason: 'not_publishing' };
  if (row.publish_phase === 'done') return { outcome: 'skipped', reason: 'done' };

  // Interrupteur de sécurité (Meta réel et publication non activée). Rien n'a encore été créé chez Meta (phase « none ») : échec
  // net, quota rendu, AVANT toute lecture du jeton. Sinon (des éléments existent peut-être chez Meta) : la reprise reste en
  // LECTURE SEULE : on rapproche et on reflète l'état de Meta (campagne déjà active, introuvable…), on supprime les restes en
  // pause, mais on n'ACTIVE rien (`canActivate` faux) ; la campagne reste « en publication » jusqu'à l'activation de l'interrupteur.
  const canActivate = deps.metaPublishEnabled();
  if (!canActivate && row.publish_phase === 'none') {
    const latest = await loadPublishRow(svc, workspaceId, campaignId);
    const error = publishDisabledError();
    await failPublication(svc, deps, ctx.now(), latest, error);
    return { outcome: 'failed', code: error.code, uncertain: false };
  }

  // Tout est relu : l'état a pu changer depuis la route (Page retirée de la formule, jeton révoqué, compte désactivé).
  const inputs = await loadPublishInputs(svc, workspaceId, row, ctx.now());
  const base = { svc, ctx, deps, row, inputs, canActivate } as const;
  const early = { ...base, token: { accessToken: '', expiresAt: null }, adAccountId: '' };
  try {
    await assertPageInPlan({ svc, workspaceId }, inputs.page, row.page_id);
    assertMetaReady(inputs);
  } catch (error) {
    return fail(early, error instanceof AppError ? error : toAppError(error));
  }
  if (inputs.adAccount === null || inputs.connection === null)
    return fail(early, new AppError('meta_not_connected'));

  let token: PlatformToken;
  try {
    token = await deps.loadToken(svc, workspaceId, inputs.connection);
  } catch (error) {
    return fail(
      early,
      error instanceof AppError ? error : new AppError('internal_error', { cause: error }),
    );
  }
  const run: Run = { ...base, token, adAccountId: accountOf(inputs) };

  try {
    switch (row.publish_phase) {
      case 'none':
        return await create(run);
      case 'creating':
        // Une exécution précédente a commencé la création sans conclure : on rapproche, on ne recrée pas.
        return await reconcile(run, undefined);
      case 'created': {
        const refs = await loadRefs(run.svc, run.row, run.adAccountId);
        // Identifiants introuvables (ne devrait pas arriver) : on retourne au rapprochement plutôt que de deviner.
        return refs === null ? await reconcile(run, undefined) : await activate(run, refs, false);
      }
      case 'activating': {
        const refs = await loadRefs(run.svc, run.row, run.adAccountId);
        return refs === null
          ? { outcome: 'pending', reason: 'activation_unknown' }
          : await resolveActivation(run, refs, false, undefined);
      }
    }
  } catch (error) {
    // Erreur de validation, de lieu, de monnaie… détectée AVANT tout appel de création : échec net, rien chez Meta.
    if (error instanceof AppError) return fail(run, error);
    throw error;
  }
}
