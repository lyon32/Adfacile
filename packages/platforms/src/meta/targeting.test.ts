import { describe, expect, it } from 'vitest';
import type { PublishTargeting } from '../types';
import { buildTargeting, getOptimizationGoal } from './targeting';

// Tests portés de backend/src/services/facebookAdsService.test.js (TR-PLA-02) : buildTargeting.
const BASE: PublishTargeting = { ageMin: 18, ageMax: 65, locations: [{ key: '1', type: 'city' }] };

describe('buildTargeting — données auparavant perdues', () => {
  it('convertit le genre au format attendu par Meta', () => {
    // Le formulaire enregistre ['male'] ; Meta attend [1]. Sans conversion, le ciblage était saisi puis
    // perdu en silence.
    expect(buildTargeting({ ...BASE, genders: ['male'] }).genders).toEqual([1]);
    expect(buildTargeting({ ...BASE, genders: ['female'] }).genders).toEqual([2]);
    expect(buildTargeting({ ...BASE, genders: [2] }).genders).toEqual([2]);
  });

  it('omet le champ pour « tous », comme Meta l’attend', () => {
    expect(buildTargeting({ ...BASE, genders: [] })).not.toHaveProperty('genders');
    expect(buildTargeting({ ...BASE })).not.toHaveProperty('genders');
    expect(buildTargeting({ ...BASE, genders: ['male', 'female'] })).not.toHaveProperty('genders');
    expect(buildTargeting({ ...BASE, genders: ['autre', 3] })).not.toHaveProperty('genders');
  });

  it('transmet les comportements aux côtés des intérêts', () => {
    const r = buildTargeting({
      ...BASE,
      interests: [{ id: '6003', name: 'Mode' }],
      behaviors: [{ id: '6002', name: 'Voyageurs' }],
    });
    expect(r.flexible_spec?.[0]?.interests).toHaveLength(1);
    expect(r.flexible_spec?.[0]?.behaviors).toEqual([{ id: '6002', name: 'Voyageurs' }]);
  });

  it('écarte les comportements sans identifiant plutôt que de tout faire échouer', () => {
    // L'assistant IA peut proposer des libellés seuls.
    const r = buildTargeting({ ...BASE, behaviors: [{ name: 'Voyageurs' }] });
    expect(r.flexible_spec).toBeUndefined();
  });
});

describe('buildTargeting — audience Advantage', () => {
  it('place targeting_automation DANS le ciblage, pas à côté', () => {
    // Meta refuse la création sans ce champ (sous-code 1870227), et le veut dans la spécification de ciblage.
    expect(buildTargeting(BASE).targeting_automation).toEqual({ advantage_audience: 0 });
  });

  it("refuse l'élargissement automatique par défaut", () => {
    expect(buildTargeting(BASE).targeting_automation.advantage_audience).toBe(0);
  });

  it("accepte l'élargissement s'il est demandé explicitement", () => {
    expect(
      buildTargeting({ ...BASE, advantageAudience: 1 }).targeting_automation.advantage_audience,
    ).toBe(1);
  });

  it("n'accepte que 0 ou 1, jamais une valeur approchante", () => {
    for (const v of [true, '1', 2, null]) {
      expect(
        buildTargeting({ ...BASE, advantageAudience: v }).targeting_automation.advantage_audience,
      ).toBe(0);
    }
  });
});

describe('buildTargeting — géolocalisation', () => {
  it('distingue pays, villes, régions et marchés', () => {
    const r = buildTargeting({
      locations: [
        { key: 'CM', type: 'country', countryCode: 'CM' },
        { key: 'SN', type: 'country' },
        { key: '2420379', type: 'city' },
        { key: '3847', type: 'region' },
        { key: 'DMA1', type: 'geo_market' },
        { key: 'x', type: 'inconnu' },
      ],
    });
    expect(r.geo_locations).toEqual({
      countries: ['CM', 'SN'],
      cities: [
        { key: '2420379', radius: 25, distance_unit: 'kilometer' },
        { key: 'x', radius: 25, distance_unit: 'kilometer' },
      ],
      regions: [{ key: '3847' }],
      geo_markets: [{ key: 'DMA1' }],
    });
  });

  it('retombe sur le Cameroun sans localisation, et prend 18-65 ans par défaut', () => {
    const r = buildTargeting({ locations: [] });
    expect(r.geo_locations).toEqual({ countries: ['CM'] });
    expect([r.age_min, r.age_max]).toEqual([18, 65]);
  });
});

describe('getOptimizationGoal', () => {
  it('associe chaque objectif à son optimisation, et retombe sur LINK_CLICKS', () => {
    expect(getOptimizationGoal('OUTCOME_AWARENESS')).toBe('REACH');
    expect(getOptimizationGoal('OUTCOME_SALES')).toBe('OFFSITE_CONVERSIONS');
    expect(getOptimizationGoal('INCONNU')).toBe('LINK_CLICKS');
    expect(getOptimizationGoal(undefined)).toBe('LINK_CLICKS');
  });
});
