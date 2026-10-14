// Règles Meta sur les médias publicitaires, vérifiées AVANT tout envoi.
// Porté de backend/src/utils/mediaSpecs.js (comportement inchangé).
//
// Sources (guide des publicités Meta) :
// - image fil d'actualité : JPG/PNG, 30 Mo max, 600 px de large min, ratios de 9:16 à 1.91:1 ;
// - carrousel : 2 à 10 cartes, ratio 1:1 attendu (tolérance 3 %, Meta recadre au-delà), titre
//   20 caractères, description 18, lien obligatoire ;
// - vidéo : 4 Go chez Meta, mais 50 Mo ici.

import type { MediaItem } from '../types';

const MO = 1024 * 1024;

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'];
export const IMAGE_MAX_BYTES = 30 * MO;
export const VIDEO_MAX_BYTES = 50 * MO;
const IMAGE_MIN_WIDTH = 600;
const RATIO_MIN = 9 / 16;
const RATIO_MAX = 1.91;
const CAROUSEL_TOLERANCE = 0.03;
const MEDIA_COUNT: Readonly<Record<string, readonly [number, number]>> = {
  carousel: [2, 10],
  flexible: [2, 10],
};
const CARD_NAME_MAX = 20;
const CARD_DESCRIPTION_MAX = 18;

export interface ImageMeasure {
  width: number;
  height: number;
  size: number;
}

export function checkImage(
  { width, height, size }: ImageMeasure,
  format: 'feed' | 'carousel' = 'feed',
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (size > IMAGE_MAX_BYTES) {
    errors.push('Image trop lourde : 30 Mo maximum.');
  }
  if (!width || width < IMAGE_MIN_WIDTH) {
    errors.push(
      `Image trop petite : ${String(IMAGE_MIN_WIDTH)} px de large minimum (reçu ${String(width || 0)} px).`,
    );
  }
  const ratio = width && height ? width / height : 0;
  if (ratio && (ratio < RATIO_MIN - 0.01 || ratio > RATIO_MAX + 0.01)) {
    errors.push("Format d'image non accepté par Meta : entre 9:16 (vertical) et 1.91:1 (paysage).");
  }
  if (format === 'carousel' && ratio && Math.abs(ratio - 1) > CAROUSEL_TOLERANCE) {
    warnings.push(
      'Le carrousel attend des images carrées (1:1, conseillé 1080×1080) : Meta recadrera celle-ci.',
    );
  }

  return { errors, warnings };
}

const isUrl = (v: string | undefined): boolean => /^https?:\/\/\S+$/i.test(v ?? '');

/** Contrôle la liste des médias d'un carrousel ou d'un format flexible ; renvoie les erreurs. */
export function checkMediaItems(
  mediaType: string | undefined,
  items: readonly Partial<MediaItem>[] = [],
): string[] {
  const limites =
    mediaType !== undefined && Object.hasOwn(MEDIA_COUNT, mediaType)
      ? MEDIA_COUNT[mediaType]
      : undefined;
  if (!limites) return [];
  const errors: string[] = [];
  const [min, max] = limites;
  const nom = mediaType === 'carousel' ? 'Le carrousel' : 'Le format « Plusieurs visuels »';

  if (items.length < min || items.length > max) {
    errors.push(
      `${nom} demande de ${String(min)} à ${String(max)} médias (reçu ${String(items.length)}).`,
    );
    return errors;
  }

  items.forEach((item, i) => {
    const rang = `Média ${String(i + 1)}`;
    if (!isUrl(item.url)) errors.push(`${rang} : le fichier n'a pas été téléversé.`);
    if (item.type !== 'image' && item.type !== 'video')
      errors.push(`${rang} : type de média inconnu.`);
    if (mediaType !== 'carousel') return;
    if (item.link && !isUrl(item.link)) {
      errors.push(`Carte ${String(i + 1)} : le lien doit commencer par http:// ou https://.`);
    }
    if ((item.name ?? '').length > CARD_NAME_MAX) {
      errors.push(`Carte ${String(i + 1)} : titre de ${String(CARD_NAME_MAX)} caractères maximum.`);
    }
    if ((item.description ?? '').length > CARD_DESCRIPTION_MAX) {
      errors.push(
        `Carte ${String(i + 1)} : description de ${String(CARD_DESCRIPTION_MAX)} caractères maximum.`,
      );
    }
  });

  return errors;
}
