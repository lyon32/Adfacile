import { describe, expect, it } from 'vitest';
import { CONTRACT_SPEC, platformConnectorContract } from '../contract/platform-connector.contract';
import { FAKE_EXPIRED_TOKEN, FakeMetaConnector } from './fake-meta-connector';

const TOKEN = { accessToken: 'fake-token', expiresAt: null };

// La fausse Meta passe la suite de contrat commune (TESTING §6.2).
platformConnectorContract('FakeMetaConnector', () => ({
  connector: new FakeMetaConnector(),
  token: TOKEN,
  expiredToken: FAKE_EXPIRED_TOKEN,
}));

describe('FakeMetaConnector — pannes simulables', () => {
  it('refuse toute création quand le moyen de paiement manque (meta_payment_method_missing)', async () => {
    const fake = new FakeMetaConnector();
    fake.simulatePaymentMethodMissing();
    await expect(fake.createCampaign(TOKEN, CONTRACT_SPEC)).rejects.toMatchObject({
      code: 'meta_payment_method_missing',
    });
    const items = await fake.healthCheck(TOKEN, 'act_1', '1');
    expect(fake.lastHealthTarget).toEqual({ adAccountId: 'act_1', pageId: '1' });
    expect(items.find((i) => i.key === 'payment_method')?.status).toBe('missing');
    fake.simulatePaymentMethodMissing(false);
    await expect(fake.createCampaign(TOKEN, CONTRACT_SPEC)).resolves.toBeDefined();
  });

  it('simule une erreur passagère, puis rétablit le service', async () => {
    const fake = new FakeMetaConnector();
    fake.simulateTransientError(2);
    await expect(fake.listPages(TOKEN)).rejects.toMatchObject({ code: 'meta_error', status: 502 });
    await expect(fake.listPages(TOKEN)).rejects.toMatchObject({ code: 'meta_error' });
    await expect(fake.listPages(TOKEN)).resolves.toHaveLength(1);
  });

  it('simule un refus avec motif, lisible par fetchRejection, et interdit de réactiver', async () => {
    const fake = new FakeMetaConnector();
    const refs = await fake.createCampaign(TOKEN, CONTRACT_SPEC);
    fake.simulateRejection(refs, 'Texte non conforme');
    expect((await fake.getStatus(TOKEN, refs)).status).toBe('rejected');
    expect(await fake.fetchRejection(TOKEN, refs)).toEqual({
      reason: 'Texte non conforme',
      adId: refs.adId,
    });
    await expect(fake.resume(TOKEN, refs)).rejects.toMatchObject({ code: 'meta_error' });
  });

  it('simule la relecture de Meta avant diffusion, puis son approbation', async () => {
    const fake = new FakeMetaConnector({ activateAs: 'in_review' });
    const refs = await fake.createCampaign(TOKEN, CONTRACT_SPEC);
    await fake.resume(TOKEN, refs);
    expect((await fake.getStatus(TOKEN, refs)).status).toBe('in_review');
    fake.simulateApproval(refs);
    expect((await fake.getStatus(TOKEN, refs)).status).toBe('active');
  });

  it('renvoie les statistiques semées, filtrées par période', async () => {
    const fake = new FakeMetaConnector();
    const refs = await fake.createCampaign(TOKEN, CONTRACT_SPEC);
    const jour = (date: string) => ({
      date,
      spendUsdCents: 250,
      impressions: 1000,
      reach: 800,
      clicks: 40,
      results: 3,
      resultType: 'link_click',
      cpmUsdCents: 250,
      ctr: 4,
      frequency: 1.2,
    });
    fake.seedStats(refs, [jour('2026-11-01'), jour('2026-11-09')]);
    expect(
      await fake.fetchStats(TOKEN, refs, { since: '2026-11-01', until: '2026-11-07' }),
    ).toHaveLength(1);
  });

  it("n'agit plus sur une campagne supprimée, et ignore un identifiant vide", async () => {
    const fake = new FakeMetaConnector();
    const refs = await fake.createCampaign(TOKEN, CONTRACT_SPEC);
    await fake.deleteCampaign(TOKEN, refs);
    await expect(fake.pause(TOKEN, refs)).rejects.toMatchObject({ code: 'meta_error' });
    expect(
      await fake.deleteCampaign(TOKEN, {
        campaignId: '',
        adsetId: null,
        adId: null,
        creativeId: null,
      }),
    ).toBe(false);
  });

  it('enregistre les modifications de la campagne et accepte un code d’autorisation', async () => {
    const fake = new FakeMetaConnector();
    const refs = await fake.createCampaign(TOKEN, CONTRACT_SPEC);
    await fake.updateCampaign(TOKEN, refs, { name: 'Nouveau', endDate: '2026-12-01' });
    expect(fake.campaigns.get(refs.campaignId)?.spec).toMatchObject({
      campaignName: 'Nouveau',
      endDate: '2026-12-01',
    });
    expect((await fake.exchangeCode('abc', 'https://x.test')).accessToken).toBe('fake-token-abc');
    expect(fake.lastRedirectUri).toBe('https://x.test');
    await expect(fake.exchangeCode('', 'https://x.test')).rejects.toMatchObject({
      code: 'meta_error',
    });
  });
});

describe('FakeMetaConnector — recherche de lieux (S16)', () => {
  it('ne trouve que les lieux semés, au bon type et dans le bon pays, sans casse', async () => {
    const fake = new FakeMetaConnector();
    fake.seedLocation({
      key: '111',
      name: 'Douala',
      type: 'city',
      countryCode: 'CM',
      region: 'Littoral',
    });
    fake.seedLocation({
      key: '222',
      name: 'Douala',
      type: 'city',
      countryCode: 'XX',
      region: null,
    });
    const found = await fake.searchLocations(TOKEN, {
      name: ' douala ',
      countryCode: 'CM',
      type: 'city',
    });
    expect(found.map((l) => l.key)).toEqual(['111']);
    expect(await fake.searchLocations(TOKEN, { name: 'Douala', type: 'region' })).toEqual([]);
    expect(
      (await fake.searchLocations(TOKEN, { name: 'Douala', type: 'city' })).map((l) => l.key),
    ).toEqual(['111', '222']);
  });

  it('refuse de modifier le budget sans la monnaie du compte (validation_failed)', async () => {
    const fake = new FakeMetaConnector();
    const refs = await fake.createCampaign(TOKEN, CONTRACT_SPEC);
    await expect(
      fake.updateCampaign(TOKEN, refs, { dailyBudgetUsdCents: 500 }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('refuse de créer pour un compte hors dollar sans taux, comme le vrai connecteur', async () => {
    const fake = new FakeMetaConnector();
    await expect(
      fake.createCampaign(TOKEN, { ...CONTRACT_SPEC, account: { code: 'NGN' } }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
