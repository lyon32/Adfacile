import { describe, expect, it } from 'vitest';
import type { PublishSpec } from '../types';
import { failure, FakeGraph, type GraphHandler } from './fake-graph.test-helper';
import { MetaConnector } from './meta-connector';

// Estimation de diffusion : GET /act_X/delivery_estimate (https://developers.facebook.com/docs/marketing-api/reference/ad-account/delivery_estimate/).
// Paramètres documentés : optimization_goal (obligatoire), targeting_spec (obligatoire), promoted_object. Champs de la réponse
// (documentés sur le nœud frère AdCampaignDeliveryEstimate, pas sur celui du compte) : estimate_mau_lower_bound,
// estimate_mau_upper_bound, estimate_ready. Lecture seule. JAMAIS de chiffre inventé : tout ce qui n'est pas clair → null.
const TOKEN = { accessToken: 'jeton-de-test', expiresAt: null };
const NOW = () => new Date('2026-10-17T10:00:00Z');

const SPEC: PublishSpec = {
  campaignName: 'x',
  objective: 'OUTCOME_ENGAGEMENT',
  adAccountId: '100000000001',
  account: { code: 'USD' },
  page: {
    id: '200000000001',
    name: 'Ma Boutique',
    instagramAccountId: null,
    instagramConnected: false,
    whatsappConnected: true,
    whatsappNumber: '+237650198196',
    whatsappPhoneNumberId: null,
  },
  messagingDestinations: ['whatsapp'],
  dailyBudgetUsdCents: 500,
  startDate: '2026-10-20',
  targeting: {
    ageMin: 20,
    ageMax: 45,
    locations: [{ key: '2447439', name: 'Douala', type: 'city', countryCode: 'CM', radiusKm: 10 }],
    advantageAudience: 1,
  },
  creative: {},
};

function connector(handler: GraphHandler) {
  const graph = new FakeGraph(handler);
  return {
    graph,
    meta: new MetaConnector({
      appId: '123456789012345',
      appSecret: 'secret-de-test',
      now: NOW,
      fetch: graph.fetch,
      allowedMediaHosts: ['cdn.test'],
    }),
  };
}

describe('MetaConnector.estimateDelivery', () => {
  it('lit les bornes de l’audience estimée par Meta', async () => {
    const { graph, meta } = connector(() => ({
      data: [
        {
          estimate_mau_lower_bound: 120000,
          estimate_mau_upper_bound: 150000,
          estimate_ready: true,
        },
      ],
    }));
    expect(await meta.estimateDelivery(TOKEN, SPEC)).toEqual({
      lowerBound: 120000,
      upperBound: 150000,
    });
    const call = graph.calls[0];
    expect(call?.method).toBe('GET');
    expect(call?.path).toBe('act_100000000001/delivery_estimate');
    expect(call?.params.optimization_goal).toBe('CONVERSATIONS');
    // Le ciblage est celui de la création (villes avec leur rayon, âge, Advantage+).
    expect(JSON.parse(call?.params.targeting_spec ?? '{}')).toMatchObject({
      age_min: 20,
      age_max: 45,
      geo_locations: { cities: [{ key: '2447439', radius: 17, distance_unit: 'kilometer' }] },
    });
    // Destination WhatsApp : l'objet promu porte la Page et le numéro.
    expect(JSON.parse(call?.params.promoted_object ?? '{}')).toMatchObject({
      page_id: '200000000001',
    });
    expect(graph.calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('accepte des bornes données en texte (le Graph API renvoie parfois des chaînes)', async () => {
    const { meta } = connector(() => ({
      data: [
        {
          estimate_mau_lower_bound: '1000',
          estimate_mau_upper_bound: '2000',
          estimate_ready: true,
        },
      ],
    }));
    expect(await meta.estimateDelivery(TOKEN, SPEC)).toEqual({
      lowerBound: 1000,
      upperBound: 2000,
    });
  });

  it.each([
    [
      'estimation pas prête',
      {
        data: [
          { estimate_mau_lower_bound: 10, estimate_mau_upper_bound: 20, estimate_ready: false },
        ],
      },
    ],
    ['aucune ligne', { data: [] }],
    ['sans données', {}],
    ['borne basse absente', { data: [{ estimate_mau_upper_bound: 20, estimate_ready: true }] }],
    ['borne haute absente', { data: [{ estimate_mau_lower_bound: 10, estimate_ready: true }] }],
    [
      'bornes non numériques',
      {
        data: [
          {
            estimate_mau_lower_bound: 'beaucoup',
            estimate_mau_upper_bound: 'énormément',
            estimate_ready: true,
          },
        ],
      },
    ],
    [
      'bornes négatives',
      {
        data: [
          { estimate_mau_lower_bound: -5, estimate_mau_upper_bound: 20, estimate_ready: true },
        ],
      },
    ],
    [
      'bornes inversées',
      {
        data: [
          { estimate_mau_lower_bound: 500, estimate_mau_upper_bound: 20, estimate_ready: true },
        ],
      },
    ],
    [
      'bornes à zéro',
      {
        data: [{ estimate_mau_lower_bound: 0, estimate_mau_upper_bound: 0, estimate_ready: true }],
      },
    ],
    [
      'bornes non entières',
      {
        data: [
          { estimate_mau_lower_bound: 1.5, estimate_mau_upper_bound: 20, estimate_ready: true },
        ],
      },
    ],
  ])('réponse inexploitable (%s) → null : aucun chiffre n’est inventé', async (_name, body) => {
    const { meta } = connector(() => body);
    expect(await meta.estimateDelivery(TOKEN, SPEC)).toBeNull();
  });

  it('une estimation sans le champ « prête » est lue comme prête dès que les deux bornes sont valides', async () => {
    const { meta } = connector(() => ({
      data: [{ estimate_mau_lower_bound: 5, estimate_mau_upper_bound: 9 }],
    }));
    expect(await meta.estimateDelivery(TOKEN, SPEC)).toEqual({ lowerBound: 5, upperBound: 9 });
  });

  it('une erreur de Meta remonte (le cas d’usage la convertit en « pas d’estimation »)', async () => {
    const { meta } = connector(() => failure({ code: 190, message: 'x' }, 401));
    await expect(meta.estimateDelivery(TOKEN, SPEC)).rejects.toMatchObject({
      code: 'meta_token_expired',
    });
  });

  it('refuse une destination invalide avant tout appel', async () => {
    const { graph, meta } = connector(() => ({}));
    await expect(
      meta.estimateDelivery(TOKEN, { ...SPEC, page: { ...SPEC.page, whatsappConnected: false } }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(graph.calls).toHaveLength(0);
  });
});
