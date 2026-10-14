// Partie visuelle de la création publicitaire selon le format choisi (image, vidéo, carrousel, flexible).
// Porté de `buildCreativeMedia`, `flexibleMode` et `whatsappIdentity`
// (backend/src/services/facebookAdsService.js), règles inchangées.
// Documentation : https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec
import type { MediaItem } from '../types';
import { firstFilled } from './messaging-destinations';

export interface CallToAction {
  type: string;
  value?: { link?: string | undefined; app_destination?: string };
}

/** Média déjà téléversé chez Meta, prêt à être cité dans une création. */
export type UploadedMedia =
  | { type: 'image'; hash: string }
  | { type: 'video'; video_id: string; thumbnail_url: string | null };

export interface ObjectStorySpec {
  page_id: string;
  instagram_user_id?: string;
  link_data?: Record<string, unknown>;
  video_data?: Record<string, unknown>;
}

export interface CreativeMedia {
  object_story_spec: ObjectStorySpec;
  asset_feed_spec?: Record<string, unknown>;
  creative_asset_groups_spec?: { groups: Record<string, unknown>[] };
}

/**
 * Comment Meta accepte « plusieurs visuels » selon l'objectif.
 *
 * - `groups` : le vrai format flexible (`creative_asset_groups_spec`), réservé par Meta aux objectifs
 *   Ventes et Promotion d'application ;
 * - `dynamic` : le contenu dynamique (`asset_feed_spec`) pour tous les autres. Meta exige alors un
 *   ensemble de publicités créé en mode dynamique (`is_dynamic_creative`), sinon la publicité est refusée.
 *
 * @returns null si le format n'est pas « flexible »
 */
export function flexibleMode(
  mediaType: string | undefined,
  objective: string | undefined,
): 'groups' | 'dynamic' | null {
  if (mediaType !== 'flexible') return null;
  return objective === 'OUTCOME_SALES' || objective === 'OUTCOME_APP_PROMOTION'
    ? 'groups'
    : 'dynamic';
}

/** Fragment de création portant le numéro WhatsApp de la Page, ou objet vide. */
export function whatsappIdentity(identityId: string | null): {
  wamo_whatsapp_identity_spec?: { wamo_whatsapp_identity_id: string };
} {
  return identityId
    ? { wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: identityId } }
    : {};
}

export interface BuildCreativeInput {
  mediaType: string | undefined;
  uploaded: readonly UploadedMedia[];
  items?: readonly MediaItem[];
  pageId: string;
  identity?: { instagram_user_id?: string };
  message?: string;
  headline?: string;
  description?: string;
  link: string | undefined;
  callToAction: CallToAction | undefined;
  bodies?: readonly string[];
  titles?: readonly string[];
  objective: string | undefined;
}

const textes = (liste: readonly string[], type?: string): Record<string, string>[] =>
  liste.filter(Boolean).map((text) => (type ? { text, text_type: type } : { text }));

/**
 * Construit la partie visuelle de la création. Fonction pure : elle reçoit les médias déjà téléversés
 * et renvoie `object_story_spec` et, pour le format flexible, `asset_feed_spec`.
 *
 * - image : link_data classique (image_hash facultatif) ;
 * - video : video_data — Meta n'accepte pas de vidéo dans link_data ;
 * - carousel : link_data.child_attachments, une carte par média ;
 * - flexible : asset_feed_spec AUTOMATIC_FORMAT, Meta choisit la combinaison.
 */
export function buildCreativeMedia(input: BuildCreativeInput): CreativeMedia {
  const {
    mediaType,
    uploaded,
    items = [],
    pageId,
    identity = {},
    link,
    callToAction,
    objective,
  } = input;
  const message = input.message ?? '';
  const headline = input.headline ?? '';
  const description = input.description ?? '';
  const bodies = input.bodies ?? [];
  const titles = input.titles ?? [];
  const objectStorySpec: ObjectStorySpec = { page_id: pageId, ...identity };

  if (mediaType === 'video') {
    const video = uploaded[0];
    objectStorySpec.video_data = {
      video_id: video?.type === 'video' ? video.video_id : undefined,
      image_url: video?.type === 'video' ? video.thumbnail_url : undefined,
      message,
      title: headline,
      link_description: description,
      call_to_action: callToAction,
    };
    return { object_story_spec: objectStorySpec };
  }

  if (mediaType === 'carousel') {
    const childAttachments = uploaded.map((media, i) => {
      const item = items[i];
      const carteLien = firstFilled(item?.link, link);
      const carte: Record<string, unknown> = {
        link: carteLien,
        name: item?.name ?? '',
        description: item?.description ?? '',
      };
      if (media.type === 'video') {
        carte.video_id = media.video_id;
        carte.picture = media.thumbnail_url;
      } else {
        carte.image_hash = media.hash;
      }
      if (callToAction) {
        carte.call_to_action =
          callToAction.type === 'CALL_NOW' || !callToAction.value?.link
            ? callToAction
            : { ...callToAction, value: { ...callToAction.value, link: carteLien } };
      }
      return carte;
    });
    objectStorySpec.link_data = {
      message,
      link,
      child_attachments: childAttachments,
      multi_share_optimized: true,
      call_to_action: callToAction,
    };
    return { object_story_spec: objectStorySpec };
  }

  if (flexibleMode(mediaType, objective) === 'groups') {
    const images = uploaded.flatMap((m) => (m.type === 'image' ? [{ hash: m.hash }] : []));
    const videos = uploaded.flatMap((m) => (m.type === 'video' ? [{ video_id: m.video_id }] : []));
    const texts = [
      ...textes([message, ...bodies], 'primary_text'),
      ...textes([headline, ...titles], 'headline'),
      ...textes([description], 'description'),
    ];
    const groupe: Record<string, unknown> = {
      ...(images.length > 0 ? { images } : {}),
      ...(videos.length > 0 ? { videos } : {}),
      ...(texts.length > 0 ? { texts } : {}),
      call_to_action: callToAction,
    };
    // Les médias et textes sont un paramètre de la publicité, pas de la création. La création garde un
    // `link_data` minimal : sans lui, Meta répond « Le champ link est requis » (relevé en réel).
    //
    // Meta exige aussi que le PREMIER média du groupe soit celui de la création (« la première image ou
    // vidéo du premier groupe doit correspondre ») : image → link_data, vidéo → video_data.
    const premier = uploaded[0];
    if (premier?.type === 'video') {
      objectStorySpec.video_data = {
        video_id: premier.video_id,
        image_url: premier.thumbnail_url,
        call_to_action: callToAction,
      };
    } else {
      objectStorySpec.link_data = { link, ...(premier ? { image_hash: premier.hash } : {}) };
    }
    return { object_story_spec: objectStorySpec, creative_asset_groups_spec: { groups: [groupe] } };
  }

  if (mediaType === 'flexible') {
    const images = uploaded.flatMap((m) => (m.type === 'image' ? [{ hash: m.hash }] : []));
    const videos = uploaded.flatMap((m) =>
      m.type === 'video' ? [{ video_id: m.video_id, thumbnail_url: m.thumbnail_url }] : [],
    );
    const feed: Record<string, unknown> = {
      ad_formats: ['AUTOMATIC_FORMAT'],
      ...(images.length > 0 ? { images } : {}),
      ...(videos.length > 0 ? { videos } : {}),
    };
    const lists: [string, Record<string, string>[]][] = [
      ['bodies', textes([message, ...bodies])],
      ['titles', textes([headline, ...titles])],
      ['descriptions', textes([description])],
    ];
    for (const [key, value] of lists) {
      if (value.length > 0) feed[key] = value;
    }
    feed.link_urls = [{ website_url: link }];
    feed.call_to_action_types = [callToAction?.type ?? 'LEARN_MORE'];
    return { object_story_spec: objectStorySpec, asset_feed_spec: feed };
  }

  // Image (ou aucun visuel).
  objectStorySpec.link_data = {
    message,
    link,
    name: headline,
    description,
    call_to_action: callToAction,
  };
  const first = uploaded[0];
  if (first?.type === 'image') objectStorySpec.link_data.image_hash = first.hash;
  return { object_story_spec: objectStorySpec };
}
