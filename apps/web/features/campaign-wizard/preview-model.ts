// Modèle de l'aperçu multi-emplacements (PRD F3, APPFLOW §8.5) : fonctions pures, sans React. L'aperçu est CONSTRUIT PAR PUBEKA
// à partir du texte et de la photo de la campagne (l'aperçu officiel de Meta, `generatepreviews`, n'est pas utilisé : voir le
// rapport de S16). Il montre le cadrage de chaque emplacement ; l'affichage réel chez Meta peut varier légèrement.
export const PLACEMENTS = [
  'facebook_feed',
  'instagram_feed',
  'stories',
  'reels',
  'messenger',
] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Cadre de chaque emplacement (largeur / hauteur). */
export const FRAME_RATIO: Readonly<Record<Placement, string>> = {
  facebook_feed: '4 / 5',
  instagram_feed: '4 / 5',
  stories: '9 / 16',
  reels: '9 / 16',
  messenger: '1 / 1',
};

/** Les Stories et les Reels sont verticaux : une photo horizontale y est recadrée (le format 9:16 dédié viendra avec S22/S23). */
export function isVertical(placement: Placement): boolean {
  return placement === 'stories' || placement === 'reels';
}

/** Raccourcit un texte à `max` caractères (points de code) avec une ellipse ; un texte plus court reste intact. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  return `${chars
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}…`;
}

/** Longueur du texte visible sans « Voir plus » selon l'emplacement (le texte complet reste lisible en dessous). */
export const VISIBLE_CHARS: Readonly<Record<Placement, number>> = {
  facebook_feed: 125,
  instagram_feed: 125,
  stories: 90,
  reels: 90,
  messenger: 80,
};

export interface CityRadius {
  name: string;
  radius_km: number;
  effective_radius_km: number;
}

/** Villes dont le rayon envoyé à Meta diffère de celui choisi (Meta impose 17 à 80 km autour d'une ville). */
export function adjustedCities(cities: readonly CityRadius[]): CityRadius[] {
  return cities.filter((c) => c.effective_radius_km !== c.radius_km);
}

/** Première lettre affichable du nom de la Page, pour l'avatar (jamais vide). */
export function initialOf(name: string | null): string {
  const first = Array.from((name ?? '').trim())[0];
  return first === undefined ? '•' : first.toLocaleUpperCase();
}
