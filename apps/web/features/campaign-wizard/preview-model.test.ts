import { describe, expect, it } from 'vitest';
import {
  adjustedCities,
  clip,
  FRAME_RATIO,
  initialOf,
  isVertical,
  PLACEMENTS,
  VISIBLE_CHARS,
} from './preview-model';

describe('aperçu — cadres', () => {
  it('cinq emplacements dans l’ordre de l’écran, chacun avec son cadre et sa longueur visible', () => {
    expect(PLACEMENTS).toEqual([
      'facebook_feed',
      'instagram_feed',
      'stories',
      'reels',
      'messenger',
    ]);
    for (const placement of PLACEMENTS) {
      expect(FRAME_RATIO[placement]).toMatch(/^\d+ \/ \d+$/);
      expect(VISIBLE_CHARS[placement]).toBeGreaterThan(0);
    }
  });

  it('seuls les Stories et les Reels sont verticaux (9:16)', () => {
    expect(PLACEMENTS.filter(isVertical)).toEqual(['stories', 'reels']);
    expect(FRAME_RATIO.stories).toBe('9 / 16');
    expect(FRAME_RATIO.facebook_feed).toBe('4 / 5');
  });
});

describe('clip', () => {
  it('laisse intact un texte assez court', () => {
    expect(clip('Bonjour', 20)).toBe('Bonjour');
    expect(clip('  Bonjour  ', 20)).toBe('Bonjour');
  });
  it('raccourcit avec une ellipse qui tient dans la limite, en points de code (un émoji compte pour un)', () => {
    const result = clip('Promo 🔥🔥🔥🔥🔥🔥🔥🔥', 8);
    expect(Array.from(result).length).toBeLessThanOrEqual(8);
    expect(result.endsWith('…')).toBe(true);
  });
  it('ne coupe pas un émoji en deux', () => {
    expect(clip('🔥🔥🔥🔥', 3)).toBe('🔥🔥…');
  });
  it('une limite de 1 ne casse rien', () => {
    expect(clip('abc', 1)).toBe('…');
  });
});

describe('adjustedCities', () => {
  it('ne garde que les villes dont le rayon envoyé à Meta change', () => {
    const cities = [
      { name: 'Douala', radius_km: 10, effective_radius_km: 17 },
      { name: 'Yaoundé', radius_km: 30, effective_radius_km: 30 },
    ];
    expect(adjustedCities(cities)).toEqual([cities[0]]);
    expect(adjustedCities([])).toEqual([]);
  });
});

describe('initialOf', () => {
  it('première lettre en majuscule, jamais vide', () => {
    expect(initialOf('ma boutique')).toBe('M');
    expect(initialOf('  été  ')).toBe('É');
    expect(initialOf('')).toBe('•');
    expect(initialOf(null)).toBe('•');
  });
});
