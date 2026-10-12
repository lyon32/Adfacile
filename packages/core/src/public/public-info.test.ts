import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { getMaintenance, listFxRates, listPlans } from './public-info';

const now = (): Date => new Date('2026-10-12T09:00:00Z');
const ctx = (svc: FakeClient) => ({ requestId: 'req_TEST', svc: svc.asService(), now });

describe('getMaintenance', () => {
  it('lit le réglage actif avec son message', async () => {
    const svc = new FakeClient().reply({
      data: { active: true, message: 'Mise à jour' },
      error: null,
    });
    await expect(getMaintenance(ctx(svc))).resolves.toEqual({
      active: true,
      message: 'Mise à jour',
    });
    expect(svc.calls[0]?.target).toBe('rpc:maintenance_status');
  });

  it('une forme inattendue vaut « inactif »', async () => {
    const svc = new FakeClient().reply({ data: 'oui', error: null });
    await expect(getMaintenance(ctx(svc))).resolves.toEqual({ active: false, message: null });
  });

  it('active non booléen et message absent', async () => {
    const svc = new FakeClient().reply({ data: { active: 'true' }, error: null });
    await expect(getMaintenance(ctx(svc))).resolves.toEqual({ active: false, message: null });
  });

  it('erreur de la base → internal_error', async () => {
    const svc = new FakeClient().reply({ data: null, error: { message: 'boom' } });
    await expect(getMaintenance(ctx(svc))).rejects.toMatchObject({ code: 'internal_error' });
  });
});

describe('listPlans', () => {
  it('renvoie les formules actives, montants en entiers, options booléennes seulement', async () => {
    const svc = new FakeClient().reply({
      data: [
        {
          code: 'starter',
          price_xaf: 7500,
          monthly_credits: 10,
          campaigns_per_period: 4,
          max_pages: 1,
          max_members: 1,
          features: { optimizer: false, note: 'x' },
        },
        {
          code: 'pro',
          price_xaf: 14500,
          monthly_credits: 15,
          campaigns_per_period: 10,
          max_pages: 3,
          max_members: 3,
          features: null,
        },
      ],
      error: null,
    });
    const plans = await listPlans(ctx(svc));
    expect(plans).toHaveLength(2);
    expect(plans[0]).toEqual({
      code: 'starter',
      price_xaf: 7500,
      monthly_credits: 10,
      campaigns_per_period: 4,
      max_pages: 1,
      max_members: 1,
      features: { optimizer: false },
    });
    expect(plans[1]?.features).toEqual({});
    expect(svc.calls[0]?.ops).toContainEqual(['eq', 'active', true]);
  });

  it('code de formule inconnu → internal_error', async () => {
    const svc = new FakeClient().reply({ data: [{ code: 'gold', features: {} }], error: null });
    await expect(listPlans(ctx(svc))).rejects.toMatchObject({ code: 'internal_error' });
  });
});

describe('listFxRates', () => {
  it('dernier taux de chaque monnaie, monnaie sans taux omise', async () => {
    const svc = new FakeClient().reply(
      {
        data: [
          {
            quote: 'XAF',
            rate: 605.1234,
            source: 'saspay',
            fetched_at: '2026-10-12T06:00:00+00:00',
          },
        ],
        error: null,
      },
      { data: [], error: null },
    );
    await expect(listFxRates(ctx(svc))).resolves.toEqual([
      {
        base: 'USD',
        quote: 'XAF',
        rate: 605.1234,
        source: 'saspay',
        fetched_at: '2026-10-12T06:00:00.000Z',
      },
    ]);
  });

  it('source inconnue → internal_error', async () => {
    const svc = new FakeClient().reply({
      data: [{ quote: 'XAF', rate: 1, source: 'autre', fetched_at: '2026-10-12T06:00:00Z' }],
      error: null,
    });
    await expect(listFxRates(ctx(svc))).rejects.toMatchObject({ code: 'internal_error' });
  });
});
