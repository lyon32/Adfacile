// Statut, modification et suppression d'une campagne chez Meta. Porté de `updateCampaignStatus` et
// `deleteCampaignOnFacebook` (backend/src/services/facebookAdsService.js), comportement inchangé.
// Documentation : https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#Updating
import type { PlatformCampaignRefs, PublishPatch } from '../types';
import { finDeJournee } from './ad-account-time';
import { FB_MIN_DAILY_BUDGET_CENTS, minDailyBudgetFcfa } from './currency';
import { getAdAccountTimezone } from './create-campaign';
import { MetaValidationError } from './errors';
import type { GraphClient } from './graph';
import { AppError } from '@pubeka/contracts';

/**
 * Applique un statut chez Meta sur les trois niveaux de la campagne.
 *
 * Les trois doivent bouger ensemble. Activer la seule campagne ne diffuse rien, parce que l'ensemble de
 * publicités et la publicité restent en pause depuis leur création : l'utilisateur verrait « active »
 * dans Pubeka pendant que Facebook n'affiche aucune diffusion.
 *
 * Ordre : du plus large au plus fin à l'activation, l'inverse à la mise en pause, pour ne jamais laisser
 * un niveau actif sous un parent en pause.
 */
export async function updateCampaignStatus(
  graph: GraphClient,
  accessToken: string,
  refs: PlatformCampaignRefs,
  status: 'active' | 'paused',
): Promise<{ status: 'ACTIVE' | 'PAUSED'; levels: number }> {
  const fbStatus = status === 'active' ? 'ACTIVE' : 'PAUSED';

  const niveaux = [refs.campaignId, refs.adsetId, refs.adId].filter((id): id is string =>
    Boolean(id),
  );
  const ordonnes = fbStatus === 'ACTIVE' ? niveaux : [...niveaux].reverse();

  for (const id of ordonnes) {
    await graph.post(id, { status: fbStatus }, { access_token: accessToken });
  }

  return { status: fbStatus, levels: ordonnes.length };
}

/**
 * Supprime une campagne chez Meta.
 *
 * Supprimer la seule ligne locale ne suffit pas : la campagne disparaît du tableau de bord mais continue
 * d'exister chez Facebook — et de dépenser si elle diffuse. Supprimer la campagne emporte l'ensemble de
 * publicités et la publicité, pas la création : relevé du 8 oct. 2026, elle restait ACTIVE dans la
 * bibliothèque du compte. Un échec sur la création n'annule pas la suppression faite.
 *
 * @returns faux s'il n'y avait aucun identifiant à supprimer
 */
export async function deleteCampaignOnMeta(
  graph: GraphClient,
  accessToken: string,
  refs: PlatformCampaignRefs,
): Promise<boolean> {
  if (!refs.campaignId) return false;

  await graph.delete(refs.campaignId, { access_token: accessToken });

  if (refs.creativeId) {
    try {
      await graph.delete(refs.creativeId, { access_token: accessToken });
    } catch {
      // La campagne est supprimée : la création restante n'empêche pas de le dire.
    }
  }
  return true;
}

/** Modifie une campagne publiée : nom (campagne), budget quotidien et date de fin (ensemble de publicités). */
export async function patchCampaign(
  graph: GraphClient,
  accessToken: string,
  refs: PlatformCampaignRefs,
  patch: PublishPatch,
  xafPerUsd?: number,
): Promise<void> {
  const auth = { access_token: accessToken };

  if (patch.dailyBudgetUsdCents !== undefined) {
    if (
      !Number.isInteger(patch.dailyBudgetUsdCents) ||
      patch.dailyBudgetUsdCents < FB_MIN_DAILY_BUDGET_CENTS
    ) {
      throw new AppError('budget_too_low', {
        meta: { minUsdCents: FB_MIN_DAILY_BUDGET_CENTS, minXaf: minDailyBudgetFcfa(xafPerUsd) },
      });
    }
  }
  const adsetChanges: Record<string, unknown> = {};
  if (patch.dailyBudgetUsdCents !== undefined)
    adsetChanges.daily_budget = patch.dailyBudgetUsdCents;
  if (patch.endDate !== undefined) {
    if (!refs.adAccountId)
      throw new MetaValidationError(
        'Le compte publicitaire est requis pour modifier la date de fin.',
      );
    const timezone = await getAdAccountTimezone(graph, refs.adAccountId, accessToken);
    const end = finDeJournee(patch.endDate, timezone);
    if (!end) throw new MetaValidationError('La date de fin est illisible.');
    adsetChanges.end_time = end;
  }

  if (patch.name !== undefined) await graph.post(refs.campaignId, { name: patch.name }, auth);
  if (Object.keys(adsetChanges).length > 0) {
    if (!refs.adsetId)
      throw new MetaValidationError("L'ensemble de publicités de la campagne est introuvable.");
    await graph.post(refs.adsetId, adsetChanges, auth);
  }
}
