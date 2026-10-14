import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { ALLOWED_MIME, checkImage, checkMediaItems } from './media-specs';

// Tests portés de backend/src/utils/mediaSpecs.test.js (TR-PLA-02).

describe("checkImage — fil d'actualité", () => {
  it('accepte une image 1440×1800 (4:5)', () => {
    expect(checkImage({ width: 1440, height: 1800, size: 2e6 }).errors).toEqual([]);
  });

  it('refuse une image de moins de 600 px de large', () => {
    expect(checkImage({ width: 500, height: 500, size: 1e5 }).errors[0]).toMatch(
      /600 px de large minimum/,
    );
  });

  it('refuse une image de plus de 30 Mo', () => {
    expect(checkImage({ width: 1080, height: 1080, size: 31 * 1024 * 1024 }).errors[0]).toMatch(
      /30 Mo/,
    );
  });

  it('refuse un ratio plus étroit que 9:16', () => {
    expect(checkImage({ width: 600, height: 1400, size: 1e5 }).errors[0]).toMatch(/format/i);
  });

  it('refuse un ratio plus large que 1.91:1', () => {
    expect(checkImage({ width: 2000, height: 1000, size: 1e5 }).errors[0]).toMatch(/format/i);
  });
});

describe('checkImage — carrousel', () => {
  it("avertit sans refuser quand l'image n'est pas carrée à 3 % près", () => {
    const res = checkImage({ width: 1080, height: 1350, size: 1e5 }, 'carousel');
    expect(res.errors).toEqual([]);
    expect(res.warnings[0]).toMatch(/1:1/);
  });

  it("n'avertit pas pour 1080×1080", () => {
    expect(checkImage({ width: 1080, height: 1080, size: 1e5 }, 'carousel').warnings).toEqual([]);
  });
});

describe('checkMediaItems', () => {
  const img: MediaItem = { url: 'https://cdn/1.jpg', type: 'image' };

  it("refuse un carrousel d'une seule carte", () => {
    expect(checkMediaItems('carousel', [img])[0]).toMatch(/2 à 10/);
  });

  it('refuse plus de 10 médias', () => {
    expect(checkMediaItems('flexible', Array(11).fill(img))[0]).toMatch(/2 à 10/);
  });

  it("refuse un lien de carte qui n'est pas une URL", () => {
    expect(checkMediaItems('carousel', [img, { ...img, link: 'pas-un-lien' }])[0]).toMatch(/lien/i);
  });

  it('refuse un titre de carte de plus de 20 caractères', () => {
    expect(checkMediaItems('carousel', [img, { ...img, name: 'x'.repeat(21) }])[0]).toMatch(/20/);
  });

  it('accepte un carrousel valide', () => {
    expect(checkMediaItems('carousel', [img, { ...img, type: 'video' }])).toEqual([]);
  });
});

it("n'accepte que JPG, PNG, MP4 et MOV", () => {
  expect(ALLOWED_MIME).toEqual(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']);
});
