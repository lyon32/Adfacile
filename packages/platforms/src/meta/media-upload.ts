// Envoi des visuels à Meta, identité WhatsApp de la Page et annulation. Porté de
// backend/src/services/facebookAdsService.js, règles inchangées (les envois passent maintenant par `fetch`).
// Documentation : https://developers.facebook.com/docs/marketing-api/reference/ad-image
//                 https://developers.facebook.com/docs/graph-api/reference/video
import { z } from 'zod';
import type { MediaItem } from '../types';
import type { UploadedMedia } from './creative';
import { MetaValidationError } from './errors';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './media-specs';
import { firstFilled } from './messaging-destinations';
import { assertDownloadableMediaUrl } from './ssrf';
import type { GraphClient } from './graph';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface UploadOptions {
  /** Délai entre deux lectures de l'état d'une vidéo. */
  intervalleMs?: number;
  /** Au-delà, la vidéo est abandonnée. */
  delaiMaxMs?: number;
  /** Attente injectable pour les tests. */
  pause?: (ms: number) => Promise<void>;
  /**
   * Hôtes autorisés pour les médias (le stockage de Pubeka) : OBLIGATOIRE et non vide. Sans elle, aucun
   * téléchargement n'a lieu : un lien arbitraire ne doit pas faire télécharger n'importe quoi par le serveur (SSRF).
   */
  allowedMediaHosts: readonly string[];
}

function fileName(mediaUrl: string, fallback: string): string {
  return firstFilled(mediaUrl.split('/').pop()?.split('?')[0]) ?? fallback;
}

const imagesSchema = z.looseObject({
  images: z.record(z.string(), z.looseObject({ hash: z.string().optional() })).optional(),
});
const idSchema = z.looseObject({ id: z.string().optional() });

/**
 * Envoie le visuel à Meta et renvoie son hash.
 *
 * Le visuel doit être transmis en multipart : passer une URL distante à /adimages échoue avec « (#3)
 * Application does not have the capability to make this API call », l'envoi par URL étant une capacité
 * réservée. On télécharge donc l'image puis on envoie les octets.
 *
 * L'échec est bloquant : une publicité sans visuel est inéligible à la plupart des placements, la
 * laisser passer silencieusement produit une campagne qui ne sera jamais diffusée.
 */
export async function uploadAdImage(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
  mediaUrl: string,
  options: UploadOptions,
): Promise<string> {
  assertDownloadableMediaUrl(
    mediaUrl,
    "Le visuel n'a pas été correctement téléversé. Ajoutez-le à nouveau.",
    options.allowedMediaHosts,
  );

  const download = await graph.download(mediaUrl, 30_000, IMAGE_MAX_BYTES);
  const form = new FormData();
  form.append(
    'source',
    new Blob([download.bytes], { type: download.contentType ?? 'image/jpeg' }),
    fileName(mediaUrl, 'creative'),
  );

  const raw = await graph.postForm(`${adAccountId}/adimages`, form, { access_token: accessToken });
  const images = imagesSchema.parse(raw).images ?? {};
  const hash = Object.values(images)[0]?.hash;
  if (!hash) throw new Error("Facebook n'a pas renvoyé d'identifiant pour le visuel.");
  return hash;
}

const videoStatusSchema = z.looseObject({
  status: z.looseObject({ video_status: z.string().optional() }).optional(),
});
const thumbnailsSchema = z.looseObject({
  data: z
    .array(z.looseObject({ uri: z.string().optional(), is_preferred: z.boolean().optional() }))
    .optional(),
});

/**
 * Téléverse une vidéo sur le compte publicitaire et attend qu'elle soit prête.
 *
 * Comme pour les images, les octets sont envoyés en multipart `source`. Meta traite ensuite la vidéo de
 * manière asynchrone ; une création qui la référence avant `ready` est refusée. On récupère enfin la
 * miniature préférée, exigée par `video_data.image_url` et par les cartes vidéo d'un carrousel.
 */
export async function uploadAdVideo(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
  mediaUrl: string,
  options: UploadOptions,
): Promise<{ video_id: string; thumbnail_url: string | null }> {
  const { intervalleMs = 3000, delaiMaxMs = 120_000, pause = wait } = options;

  assertDownloadableMediaUrl(
    mediaUrl,
    "La vidéo n'a pas été correctement téléversée. Ajoutez-la à nouveau.",
    options.allowedMediaHosts,
  );

  const download = await graph.download(mediaUrl, 120_000, VIDEO_MAX_BYTES);
  const form = new FormData();
  form.append(
    'source',
    new Blob([download.bytes], { type: download.contentType ?? 'video/mp4' }),
    fileName(mediaUrl, 'video.mp4'),
  );

  const videoId = idSchema.parse(
    await graph.postForm(
      `${adAccountId}/advideos`,
      form,
      { access_token: accessToken },
      { timeoutMs: 120_000 },
    ),
  ).id;
  if (!videoId) throw new Error("Facebook n'a pas renvoyé d'identifiant pour la vidéo.");

  // Attendre la fin du traitement.
  let ecoule = 0;
  for (;;) {
    const data = videoStatusSchema.parse(
      await graph.get(videoId, { fields: 'status', access_token: accessToken }),
    );
    const statut = data.status?.video_status;
    if (statut === 'ready') break;
    if (statut === 'error') {
      throw new MetaValidationError(
        "Facebook n'a pas pu traiter la vidéo. Vérifiez son format (MP4 ou MOV, H.264).",
      );
    }
    if (ecoule >= delaiMaxMs) {
      throw new MetaValidationError(
        'Le traitement de la vidéo par Facebook prend trop de temps. Réessayez dans quelques minutes.',
      );
    }
    await pause(intervalleMs);
    ecoule += intervalleMs;
  }

  const miniatures = thumbnailsSchema.parse(
    await graph.get(`${videoId}/thumbnails`, { access_token: accessToken }),
  );
  const liste = miniatures.data ?? [];
  const preferee = liste.find((m) => m.is_preferred) ?? liste[0];
  return { video_id: videoId, thumbnail_url: preferee?.uri ?? null };
}

/** Téléverse un média (image ou vidéo) et renvoie ce qu'il faut pour le citer dans une création. */
export async function uploadMediaItem(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
  item: MediaItem,
  options: UploadOptions,
): Promise<UploadedMedia> {
  if (item.type === 'video') {
    return {
      type: 'video',
      ...(await uploadAdVideo(graph, adAccountId, accessToken, item.url, options)),
    };
  }
  return {
    type: 'image',
    hash: await uploadAdImage(graph, adAccountId, accessToken, item.url, options),
  };
}

const identitiesSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        object_story_spec: z.looseObject({ page_id: z.string().optional() }).optional(),
        wamo_whatsapp_identity_spec: z
          .looseObject({ wamo_whatsapp_identity_id: z.string().optional() })
          .optional(),
      }),
    )
    .optional(),
});

/**
 * Identité WhatsApp de la Page, pour le champ « Numéro de téléphone WhatsApp » de l'identité de la
 * publicité. Meta la stocke dans `wamo_whatsapp_identity_spec.wamo_whatsapp_identity_id` (relevé sur les
 * créations faites dans Ads Manager). Cet identifiant n'est lisible ni sur la Page ni sur le compte
 * publicitaire : la seule source fiable est une création existante de la même Page. On prend le plus
 * fréquent.
 *
 * Non bloquant : sans identité connue, ou si la lecture échoue, la publicité part sans numéro, comme avant.
 */
export async function findWhatsAppIdentity(
  graph: GraphClient,
  adAccountId: string,
  accessToken: string,
  pageId: string,
): Promise<string | null> {
  try {
    const raw = await graph.get(`${adAccountId}/adcreatives`, {
      access_token: accessToken,
      fields: 'object_story_spec{page_id},wamo_whatsapp_identity_spec',
      limit: 100,
    });
    const compte = new Map<string, number>();
    for (const c of identitiesSchema.parse(raw).data ?? []) {
      const id = c.wamo_whatsapp_identity_spec?.wamo_whatsapp_identity_id;
      if (id && c.object_story_spec?.page_id === pageId) compte.set(id, (compte.get(id) ?? 0) + 1);
    }
    const [meilleur] = [...compte.entries()].sort((a, b) => b[1] - a[1]);
    return meilleur ? meilleur[0] : null;
  } catch {
    return null;
  }
}

export interface CreatedObjects {
  campaign?: string | null;
  adset?: string | null;
  creative?: string | null;
  ad?: string | null;
}

/**
 * Supprime chez Meta les objets déjà créés quand la suite échoue. Supprimer la campagne suffit en
 * principe — Meta supprime l'arborescence — mais on parcourt les niveaux du plus fin au plus large pour
 * couvrir le cas où la suppression de la campagne serait refusée.
 *
 * Une erreur d'annulation n'est jamais propagée : elle masquerait l'erreur d'origine, seule utile à
 * l'utilisateur.
 */
export async function rollbackFacebookObjects(
  graph: GraphClient,
  created: CreatedObjects,
  accessToken: string,
): Promise<void> {
  const targets = [created.ad, created.creative, created.adset, created.campaign].filter(
    (id): id is string => Boolean(id),
  );
  for (const id of targets) {
    try {
      await graph.delete(id, { access_token: accessToken });
    } catch {
      // Silencieux : l'erreur d'origine prime.
    }
  }
}
