// Estimation de portée (F6) : elle vient de Meta (estimation de diffusion), JAMAIS d'un calcul ou d'un chiffre de Pubeka. Quand
// Meta ne répond pas ou ne donne rien d'exploitable, l'écran n'affiche AUCUNE estimation (statut « unavailable », audience null).
import { AppError } from '@pubeka/contracts';
import { FakeMetaConnector, FAKE_EXPIRED_TOKEN } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { NOW } from '../campaigns.test-helper';
import { getReachEstimate, type ReachEstimateDeps } from './reach-estimate';
import { publishWorld, rowOf, type PublishWorld } from './publish.test-helper';

const TOKEN = { accessToken: 'jeton-de-test', expiresAt: null };

function setup(over: Parameters<typeof publishWorld>[0] = {}): {
  w: PublishWorld;
  fake: FakeMetaConnector;
  deps: ReachEstimateDeps;
} {
  const w = publishWorld(over);
  const fake = new FakeMetaConnector();
  return { w, fake, deps: { connector: fake, loadToken: () => Promise.resolve(TOKEN) } };
}

describe('getReachEstimate', () => {
  it('rend les bornes données par Meta, avec leur origine et l’heure de la lecture', async () => {
    const { w, fake, deps } = setup();
    fake.simulateEstimate({ lowerBound: 120000, upperBound: 150000 });
    const view = await getReachEstimate(w.ctx, w.campaignId, deps);
    expect(view).toEqual({
      status: 'ok',
      reason: null,
      audience: { lower: 120000, upper: 150000 },
      source: 'meta_delivery_estimate',
      fetched_at: NOW.toISOString(),
    });
  });

  it('transmet à Meta le ciblage relu en base (zone, âge, Advantage+, destination), sans aucun montant du navigateur', async () => {
    const { w, fake, deps } = setup({
      draft: {
        targeting: { age_min: 25, age_max: 40, advantage_plus: true },
        geo: { cities: [{ name: 'Douala', radius_km: 20 }] },
      },
    });
    fake.seedLocation({
      key: '2447439',
      name: 'Douala',
      type: 'city',
      countryCode: 'CM',
      region: null,
    });
    fake.simulateEstimate({ lowerBound: 10, upperBound: 20 });
    await getReachEstimate(w.ctx, w.campaignId, deps);
    expect(fake.lastEstimateSpec?.targeting).toMatchObject({
      ageMin: 25,
      ageMax: 40,
      advantageAudience: 1,
      locations: [{ key: '2447439', type: 'city', radiusKm: 20 }],
    });
    expect(fake.lastEstimateSpec?.messagingDestinations).toEqual(['whatsapp']);
  });

  it('Meta ne donne pas d’estimation : « unavailable », aucune audience (pas de chiffre inventé)', async () => {
    const { w, fake, deps } = setup();
    fake.simulateEstimate(null);
    expect(await getReachEstimate(w.ctx, w.campaignId, deps)).toMatchObject({
      status: 'unavailable',
      reason: 'not_ready',
      audience: null,
    });
  });

  it('Meta ne répond pas : « unavailable » (meta_unavailable), jamais une erreur sur l’écran', async () => {
    const { w, fake, deps } = setup();
    fake.simulateTransientError(1);
    const view = await getReachEstimate(w.ctx, w.campaignId, deps);
    expect(view).toMatchObject({
      status: 'unavailable',
      reason: 'meta_unavailable',
      audience: null,
    });
  });

  it('jeton refusé par Meta : « unavailable » (token_expired)', async () => {
    const { w, deps } = setup();
    const view = await getReachEstimate(w.ctx, w.campaignId, {
      ...deps,
      loadToken: () => Promise.resolve(FAKE_EXPIRED_TOKEN),
    });
    expect(view).toMatchObject({ status: 'unavailable', reason: 'token_expired', audience: null });
  });

  it('connexion révoquée : « unavailable » (token_expired) sans appeler Meta', async () => {
    const { w, fake, deps } = setup();
    const connection = w.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.status = 'revoked';
    fake.simulateEstimate({ lowerBound: 1, upperBound: 2 });
    expect(await getReachEstimate(w.ctx, w.campaignId, deps)).toMatchObject({
      reason: 'token_expired',
      audience: null,
    });
    expect(fake.lastEstimateSpec).toBeNull();
  });

  it('Meta pas relié : « unavailable » (not_connected), sans appel', async () => {
    const { w, fake, deps } = setup({ draft: { ad_account_id: null } });
    fake.simulateEstimate({ lowerBound: 1, upperBound: 2 });
    expect(await getReachEstimate(w.ctx, w.campaignId, deps)).toMatchObject({
      reason: 'not_connected',
      audience: null,
    });
    expect(fake.lastEstimateSpec).toBeNull();
  });

  it('campagne incomplète (pas de zone, pas de budget…) : « unavailable » (incomplete_campaign), sans appel', async () => {
    const { w, fake, deps } = setup({ draft: { geo: {}, daily_budget_usd_cents: null } });
    fake.simulateEstimate({ lowerBound: 1, upperBound: 2 });
    expect(await getReachEstimate(w.ctx, w.campaignId, deps)).toMatchObject({
      reason: 'incomplete_campaign',
      audience: null,
    });
    expect(fake.lastEstimateSpec).toBeNull();
  });

  it('ville introuvable chez Meta : « unavailable » (incomplete_campaign)', async () => {
    const { w, fake, deps } = setup({
      draft: { geo: { cities: [{ name: 'Villeinconnue', radius_km: 10 }] } },
    });
    fake.simulateEstimate({ lowerBound: 1, upperBound: 2 });
    expect(await getReachEstimate(w.ctx, w.campaignId, deps)).toMatchObject({
      reason: 'incomplete_campaign',
      audience: null,
    });
  });

  it('un lecteur peut voir l’estimation (lecture seule), même en lecture seule de l’espace', async () => {
    const { w, fake, deps } = setup({ role: 'viewer', access: 'read_only' });
    fake.simulateEstimate({ lowerBound: 5, upperBound: 9 });
    expect(await getReachEstimate(w.ctx, w.campaignId, deps)).toMatchObject({ status: 'ok' });
  });

  it('une campagne d’un autre espace ou inconnue est introuvable (404)', async () => {
    const { w, deps } = setup();
    Object.assign(rowOf(w.db, w.campaignId), { workspace_id: 'autre' });
    await expect(getReachEstimate(w.ctx, w.campaignId, deps)).rejects.toBeInstanceOf(AppError);
    await expect(
      getReachEstimate(w.ctx, '00000000-0000-4000-8000-0000000000aa', deps),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('ne dépense rien et ne modifie rien : la campagne et le quota restent intacts', async () => {
    const { w, fake, deps } = setup();
    fake.simulateEstimate({ lowerBound: 1, upperBound: 2 });
    const before = JSON.stringify(rowOf(w.db, w.campaignId));
    await getReachEstimate(w.ctx, w.campaignId, deps);
    expect(JSON.stringify(rowOf(w.db, w.campaignId))).toBe(before);
    expect(w.hooks.events).toEqual([]);
    expect(fake.createAttempts).toBe(0);
  });
});
