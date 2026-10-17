import { describe, expect, it } from 'vitest';
import { buildTargeting, cityRadiusKm } from './targeting';

// Meta accepte 17 à 80 km autour d'une ville :
// https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting (geo_locations.cities)
// S15 laisse choisir 1 à 80 km : le connecteur ramène la valeur dans la plage de Meta au lieu de forcer 25 km.
describe('rayon autour d’une ville (S16)', () => {
  it('envoie le rayon demandé quand Meta l’accepte', () => {
    expect(cityRadiusKm(17)).toBe(17);
    expect(cityRadiusKm(40)).toBe(40);
    expect(cityRadiusKm(80)).toBe(80);
  });

  it('relève un rayon trop petit à 17 km (minimum de Meta) et ramène un rayon trop grand à 80 km', () => {
    expect(cityRadiusKm(1)).toBe(17);
    expect(cityRadiusKm(10)).toBe(17);
    expect(cityRadiusKm(16)).toBe(17);
    expect(cityRadiusKm(81)).toBe(80);
    expect(cityRadiusKm(10_000)).toBe(80);
  });

  it('garde 25 km (comportement d’AdFacile) quand aucun rayon n’est donné ou qu’il est illisible', () => {
    expect(cityRadiusKm(undefined)).toBe(25);
    expect(cityRadiusKm(Number.NaN)).toBe(25);
    expect(cityRadiusKm(Number.POSITIVE_INFINITY)).toBe(25);
  });

  it('arrondit un rayon décimal à l’entier le plus proche', () => {
    expect(cityRadiusKm(30.4)).toBe(30);
    expect(cityRadiusKm(30.5)).toBe(31);
  });

  it('applique le rayon de chaque ville dans le ciblage, sans toucher aux pays', () => {
    const result = buildTargeting({
      locations: [
        { key: 'CM', type: 'country', countryCode: 'CM' },
        { key: '111', type: 'city', radiusKm: 10 },
        { key: '222', type: 'city', radiusKm: 50 },
        { key: '333', type: 'city' },
      ],
    });
    expect(result.geo_locations).toEqual({
      countries: ['CM'],
      cities: [
        { key: '111', radius: 17, distance_unit: 'kilometer' },
        { key: '222', radius: 50, distance_unit: 'kilometer' },
        { key: '333', radius: 25, distance_unit: 'kilometer' },
      ],
    });
  });
});
