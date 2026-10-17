// Création complète d'une campagne chez Meta : Campaign → Ad Set → Ad Creative → Ad.
// Porté de `createFullCampaign` (backend/src/services/facebookAdsService.js), comportement inchangé.
// Ce qui change, parce que Pubeka sépare les couches : aucun accès à la base (les identifiants créés sont
// renvoyés à `core`, qui les enregistre et, si l'enregistrement échoue, appelle `deleteCampaign`), le
// jeton arrive déchiffré, le budget arrive en centimes de dollar, l'heure vient de l'appelant.
// Aucune relance automatique : un résultat incertain n'est jamais rejoué (SECURITY_NOTES EC-META-05).
// Documentation : https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
//                 https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
//                 https://developers.facebook.com/docs/marketing-api/reference/ad-creative
//                 https://developers.facebook.com/docs/marketing-api/reference/adgroup
import { AppError } from '@pubeka/contracts';
import { z } from 'zod';
import type { AccountCurrency, MediaItem, PlatformCampaignRefs, PublishSpec } from '../types';
import {
  accountMinPerDayMinor,
  PUBEKA_MIN_DAILY_USD_CENTS,
  usdCentsToAccountMinor,
} from './account-currency';
import { debutDeJournee, finDeJournee } from './ad-account-time';
import { getBillingEvent } from './campaign-objectives';
import {
  buildCreativeMedia,
  flexibleMode,
  whatsappIdentity,
  type CallToAction,
  type UploadedMedia,
} from './creative';
import {
  buildPromotedObject,
  instagramIdentity,
  phoneCallToAction,
  resolveDestination,
  type Conversion,
} from './destination';
import { MetaValidationError } from './errors';
import type { GraphClient } from './graph';
import {
  findWhatsAppIdentity,
  rollbackFacebookObjects,
  uploadMediaItem,
  type CreatedObjects,
  type UploadOptions,
} from './media-upload';
import { buildMessageExtensions, firstFilled } from './messaging-destinations';
import { assertMediaHostsConfigured } from './ssrf';
import { buildTargeting } from './targeting';

/** Fuseau retenu si Meta ne renvoie pas celui du compte. */
const FUSEAU_PAR_DEFAUT = 'America/Los_Angeles';

export interface CreateCampaignDeps {
  graph: GraphClient;
  /** L'instant présent (`ctx.now()`). */
  now: () => Date;
  /** Hôtes de médias autorisés (obligatoire, anti-SSRF) et réglages d'attente des vidéos. */
  upload: UploadOptions;
  /** Avancement pour l'écran (campagne, ensemble, medias, video, publicite). Ne doit jamais faire échouer la création. */
  onStep?: (name: string, detail?: { current: number; total: number }) => void;
}

const idSchema = z.looseObject({ id: z.string().optional() });
const timezoneSchema = z.looseObject({ timezone_name: z.string().optional() });

function createdId(raw: unknown, what: string): string {
  const id = idSchema.parse(raw).id;
  if (!id) throw new Error(`Facebook n'a pas renvoyé d'identifiant pour ${what}.`);
  return id;
}

/**
 * Récupère le fuseau horaire du compte publicitaire. Meta interprète les dates de diffusion dans ce
 * fuseau, jamais en UTC : sans lui, une date de fin recule d'un jour pour tout compte à l'ouest de
 * Greenwich.
 */
export async function getAdAccountTimezone(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
): Promise<string> {
  try {
    const raw = await graph.get(adAccountId, {
      access_token: accessToken,
      fields: 'timezone_name',
    });
    return timezoneSchema.parse(raw).timezone_name ?? FUSEAU_PAR_DEFAUT;
  } catch {
    return FUSEAU_PAR_DEFAUT;
  }
}

/** Compatibilité : convertit les anciens objectifs (frontend) vers les nouveaux (API v21 et suivantes). */
const OBJECTIVE_COMPAT_MAP: Readonly<Record<string, string>> = {
  LINK_CLICKS: 'OUTCOME_TRAFFIC',
  PAGE_LIKES: 'OUTCOME_AWARENESS',
  POST_ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  REACH: 'OUTCOME_AWARENESS',
  BRAND_AWARENESS: 'OUTCOME_AWARENESS',
  LEAD_GENERATION: 'OUTCOME_LEADS',
  CONVERSIONS: 'OUTCOME_SALES',
  APP_INSTALLS: 'OUTCOME_APP_PROMOTION',
  VIDEO_VIEWS: 'OUTCOME_ENGAGEMENT',
  MESSAGES: 'OUTCOME_ENGAGEMENT',
};

export function normalizeObjective(objective: string): string {
  return Object.hasOwn(OBJECTIVE_COMPAT_MAP, objective)
    ? (OBJECTIVE_COMPAT_MAP[objective] ?? objective)
    : objective;
}

/**
 * Budget en centimes de dollar → unité mineure de la monnaie du compte, après avoir vérifié le minimum de Pubeka (1 $ par
 * jour, TR-PLA-10). Le minimum est redonné dans la monnaie du compte (`meta.minAccountMinor`, `meta.currency`).
 */
function assertBudget(cents: number | undefined, account: AccountCurrency): number {
  if (cents === undefined || !Number.isInteger(cents) || cents < PUBEKA_MIN_DAILY_USD_CENTS) {
    throw new AppError('budget_too_low', {
      meta: {
        minUsdCents: PUBEKA_MIN_DAILY_USD_CENTS,
        currency: account.code,
        ...minimumInAccount(account),
      },
    });
  }
  return usdCentsToAccountMinor(cents, account);
}

function minimumInAccount(account: AccountCurrency): { minAccountMinor?: number } {
  try {
    return { minAccountMinor: accountMinPerDayMinor(account) };
  } catch {
    // Monnaie ou taux inutilisable : le refus de la monnaie est donné ailleurs, ici on n'invente rien.
    return {};
  }
}

/** Les médias à téléverser : un seul pour image/vidéo, plusieurs pour le carrousel et le format flexible. */
function mediaItemsOf(spec: PublishSpec): readonly MediaItem[] {
  const { mediaType, mediaItems, mediaUrl } = spec.creative;
  if (mediaType === 'carousel' || mediaType === 'flexible') return mediaItems ?? [];
  if (mediaUrl && (mediaType === 'image' || mediaType === 'video'))
    return [{ url: mediaUrl, type: mediaType }];
  return [];
}

export async function createFullCampaign(
  deps: CreateCampaignDeps,
  accessToken: string,
  spec: PublishSpec,
): Promise<PlatformCampaignRefs> {
  const { graph } = deps;
  const step = (name: string, detail?: { current: number; total: number }): void => {
    try {
      deps.onStep?.(name, detail);
    } catch {
      // Sans effet sur la création.
    }
  };

  // Configuration obligatoire, vérifiée avant tout appel : hôtes de médias (anti-SSRF) et monnaie du compte.
  assertMediaHostsConfigured(deps.upload.allowedMediaHosts);
  const account = spec.account;
  // Monnaie et taux utilisables : refus immédiat (aucun objet créé) plutôt qu'un budget faux chez Meta.
  usdCentsToAccountMinor(PUBEKA_MIN_DAILY_USD_CENTS, account);

  const objective = normalizeObjective(spec.objective);
  const adAccountId = spec.adAccountId.startsWith('act_')
    ? spec.adAccountId
    : `act_${spec.adAccountId}`;
  const page = spec.page;

  // Tout ce qui peut être refusé sans appeler Meta l'est avant le premier appel : mieux vaut le dire
  // tout de suite que laisser des objets orphelins chez Meta.
  const destination = resolveDestination({ ...spec, objective }, page);
  const identiteInstagram = instagramIdentity(destination.destination_type, page);
  const boutonAppel =
    destination.destination_type === 'PHONE_CALL' ? phoneCallToAction(spec.phoneNumber) : null;
  if (spec.targeting.locations.length === 0) {
    throw new MetaValidationError('Au moins une localisation est requise');
  }
  // Le budget de Pubeka est en centimes de dollar ; Meta attend l'unité mineure de la monnaie du COMPTE (EC-META-11).
  // Le minimum est de 1 $ par jour (TR-PLA-10).
  const dailyBudgetMinor = assertBudget(spec.dailyBudgetUsdCents, account);
  const lifetime = spec.budgetType === 'lifetime' && Boolean(spec.endDate);
  const lifetimeBudgetMinor = lifetime
    ? assertBudget(spec.lifetimeBudgetUsdCents ?? spec.dailyBudgetUsdCents, account)
    : null;
  const bidAmountMinor =
    spec.costPerResultUsdCents !== undefined && spec.costPerResultUsdCents > 0
      ? usdCentsToAccountMinor(spec.costPerResultUsdCents, account)
      : null;
  const mediaType = spec.creative.mediaType;
  const items = mediaItemsOf(spec);
  if (mediaType === 'video' && items.length === 0) {
    throw new MetaValidationError('Ajoutez une vidéo pour cette publicité.');
  }

  const timezone = await getAdAccountTimezone(graph, adAccountId, accessToken);

  // Identifiants des objets créés, pour pouvoir revenir en arrière.
  const created: CreatedObjects = { campaign: null, adset: null, creative: null, ad: null };
  const auth = { access_token: accessToken };

  try {
    // 1. Campagne.
    step('campagne');
    const campaignId = createdId(
      await graph.post(
        `${adAccountId}/campaigns`,
        {
          name: spec.campaignName,
          objective: objective || 'OUTCOME_TRAFFIC',
          status: 'PAUSED', // Ne pas lancer tout de suite.
          special_ad_categories: [], // Obligatoire même vide.
          is_adset_budget_sharing_enabled: false, // Requis depuis l'API v21 : pas de budget au niveau campagne.
        },
        auth,
      ),
      'la campagne',
    );
    created.campaign = campaignId;

    // 2. Ensemble de publicités.
    step('ensemble');
    const dsaName = firstFilled(page.name, spec.campaignName) ?? 'Advertiser';
    const adSetPayload: Record<string, unknown> = {
      name: spec.adsetName ?? `${spec.campaignName} - AdSet`,
      campaign_id: campaignId,
      daily_budget: dailyBudgetMinor,
      billing_event: getBillingEvent(),
      optimization_goal: destination.optimization_goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: buildTargeting(spec.targeting),
      destination_type: destination.destination_type,
      status: 'PAUSED',
      start_time: debutDeJournee(spec.startDate, timezone, deps.now()),
      // DSA (Digital Services Act) — exigé par Meta pour tous les ensembles de publicités.
      dsa_beneficiary: dsaName,
      dsa_payor: dsaName,
    };

    // promoted_object seulement si nécessaire (messagerie, Instagram, pixel).
    const conversion: Conversion | null = destination.isMessaging ? null : destination.conversion;
    const promotedObject = buildPromotedObject(
      destination.destination_type,
      page,
      destination.isMessaging ? destination.whatsapp_phone_number : null,
      destination.isMessaging ? destination.whatsapp_phone_number_id : null,
      conversion,
    );
    if (promotedObject) adSetPayload.promoted_object = promotedObject;

    if (flexibleMode(mediaType, objective) === 'dynamic') adSetPayload.is_dynamic_creative = true;

    // Objectif de coût par résultat (optionnel) — bascule en stratégie « coût maîtrisé ».
    if (bidAmountMinor !== null) {
      adSetPayload.bid_strategy = 'COST_CAP';
      adSetPayload.bid_amount = bidAmountMinor;
    }

    if (lifetimeBudgetMinor !== null) {
      delete adSetPayload.daily_budget;
      adSetPayload.lifetime_budget = lifetimeBudgetMinor;
    }

    if (spec.endDate) {
      // Fin de la journée choisie dans le fuseau du compte : minuit UTC ferait s'arrêter la campagne la
      // veille au soir pour un compte situé à l'ouest de Greenwich.
      adSetPayload.end_time = finDeJournee(spec.endDate, timezone);
    }

    const adsetId = createdId(
      await graph.post(`${adAccountId}/adsets`, adSetPayload, auth),
      "l'ensemble de publicités",
    );
    created.adset = adsetId;

    // 3. Médias et création publicitaire.
    const uploaded: UploadedMedia[] = [];
    for (const [i, item] of items.entries()) {
      step(item.type === 'video' ? 'video' : 'medias', { current: i + 1, total: items.length });
      uploaded.push(await uploadMediaItem(graph, adAccountId, accessToken, item, deps.upload));
    }

    // Le lien et le bouton viennent de la destination résolue : c'est ce qui garantit qu'une création de
    // messagerie ne se retrouve pas dans un ensemble de publicités de messagerie avec un bouton de site web.
    const creativeLink = destination.isMessaging
      ? destination.link
      : (spec.creative.link ?? spec.websiteUrl);
    const callToAction: CallToAction | undefined = destination.isMessaging
      ? destination.call_to_action
      : (boutonAppel ?? {
          type: spec.creative.callToAction ?? 'LEARN_MORE',
          value: { link: creativeLink },
        });

    const media = buildCreativeMedia({
      mediaType,
      uploaded,
      items,
      pageId: page.id,
      identity: identiteInstagram,
      message: spec.creative.message ?? '',
      headline: spec.creative.headline ?? '',
      description: spec.creative.description ?? '',
      link: creativeLink,
      callToAction,
      bodies: spec.creative.bodies ?? [],
      titles: spec.creative.titles ?? [],
      objective,
    });
    const objectStorySpec = media.object_story_spec;
    // Partie « texte » commune à link_data et video_data.
    const story = objectStorySpec.link_data ?? objectStorySpec.video_data;

    // Le lien d'affichage était saisi dans le formulaire, montré dans l'aperçu, puis jamais transmis. Chez
    // Meta, c'est `caption`.
    if (spec.creative.displayLink && objectStorySpec.link_data) {
      objectStorySpec.link_data.caption = spec.creative.displayLink;
    }

    // Message d'accueil de la conversation : la première chose que voit la personne en ouvrant la
    // discussion. Sans lui, Meta affiche un texte générique.
    if (destination.isMessaging && spec.creative.welcomeMessage && story) {
      story.page_welcome_message = spec.creative.welcomeMessage;
    }

    const creativePayload: Record<string, unknown> = {
      name: spec.adName ?? `${spec.campaignName} - Creative`,
      object_story_spec: objectStorySpec,

      // Publicités multi-annonceurs : la publicité peut apparaître aux côtés d'autres dans la même unité,
      // et le visuel être recadré. Depuis le 19 août 2024, Meta y inscrit d'office toute publicité qui ne
      // précise pas ce champ. Le champ est donc toujours transmis, avec la valeur décidée par l'utilisateur.
      contextual_multi_ads: {
        enroll_status: spec.multiAdvertiserAds === false ? 'OPT_OUT' : 'OPT_IN',
      },

      // Numéro WhatsApp de la Page dans l'identité, pour tous les objectifs et toutes les destinations.
      ...whatsappIdentity(await findWhatsAppIdentity(graph, adAccountId, accessToken, page.id)),
    };

    // Paramètres d'URL (UTM) : sans eux, impossible pour l'utilisateur de savoir d'où vient son trafic.
    if (spec.creative.urlTags) creativePayload.url_tags = spec.creative.urlTags;

    // Exigé par Meta dès que la publicité vise plusieurs applications de messagerie : sans lui, la
    // création est refusée (sous-code 2446493). Le format flexible y fusionne ses médias et textes.
    const destinationFeed = destination.isMessaging ? destination.asset_feed_spec : null;
    let assetFeed: Record<string, unknown> | undefined =
      destinationFeed || media.asset_feed_spec
        ? { ...destinationFeed, ...media.asset_feed_spec }
        : undefined;

    // Bandeau de messagerie sur une publicité qui mène vers un site web. Meta impose alors que la création
    // soit passée **en ligne** dans POST /ads — la déclarer séparément échoue avec « (#3) Application does
    // not have the capability ». Ventes en est exclue : Meta ne propose pas ce bandeau sur cet objectif.
    const extensions =
      destination.isMessaging || objective === 'OUTCOME_SALES'
        ? null
        : buildMessageExtensions(spec.websiteMessageApps);
    if (extensions) assetFeed = { ...assetFeed, ...extensions };
    if (assetFeed) creativePayload.asset_feed_spec = assetFeed;

    // Le format flexible (Ventes) se déclare avec la publicité : la création est passée en ligne dans POST /ads.
    const enLigne = Boolean(extensions ?? media.creative_asset_groups_spec);
    let creativeId: string | null = null;
    if (!enLigne) {
      creativeId = createdId(
        await graph.post(`${adAccountId}/adcreatives`, creativePayload, auth),
        'la création',
      );
      created.creative = creativeId;
    }

    // 4. Publicité.
    step('publicite');
    const adId = createdId(
      await graph.post(
        `${adAccountId}/ads`,
        {
          name: spec.adName ?? `${spec.campaignName} - Ad`,
          adset_id: adsetId,
          creative: creativeId ? { creative_id: creativeId } : creativePayload,
          ...(media.creative_asset_groups_spec
            ? { creative_asset_groups_spec: media.creative_asset_groups_spec }
            : {}),
          status: 'PAUSED',
        },
        auth,
      ),
      'la publicité',
    );
    created.ad = adId;

    return { campaignId, adsetId, adId, creativeId, adAccountId };
  } catch (error) {
    // Supprimer ce qui a déjà été créé chez Meta. Sans cela, chaque échec laisse une campagne
    // inaccessible depuis Pubeka. L'erreur d'origine est ensuite renvoyée telle quelle.
    await rollbackFacebookObjects(graph, created, accessToken);
    throw error;
  }
}
