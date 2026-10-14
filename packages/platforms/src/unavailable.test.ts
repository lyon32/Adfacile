import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import type { PlatformConnector } from './types';
import { googleConnector } from './google';
import { tiktokConnector } from './tiktok';

const TOKEN = { accessToken: 'jeton-de-test', expiresAt: null };
const REFS = { campaignId: '1', adsetId: null, adId: null, creativeId: null };
const SPEC = {
  campaignName: 'x',
  objective: 'OUTCOME_TRAFFIC',
  adAccountId: 'act_1',
  page: {
    id: '1',
    name: null,
    instagramAccountId: null,
    instagramConnected: false,
    whatsappConnected: false,
    whatsappNumber: null,
    whatsappPhoneNumberId: null,
  },
  dailyBudgetUsdCents: 100,
  startDate: '2026-01-01',
  targeting: { locations: [] },
  creative: {},
};

describe.each([
  ['google', googleConnector],
  ['tiktok', tiktokConnector],
])('connecteur %s « bientôt »', (name, impl) => {
  const connector: PlatformConnector = impl;
  it('se déclare indisponible', () => {
    expect(connector.platform).toBe(name);
    expect(connector.available).toBe(false);
  });

  it('refuse chaque opération par provider_unavailable (503)', async () => {
    expect(() => connector.authorizeUrl('s', 'https://x.test/cb')).toThrow(AppError);
    const calls = [
      connector.exchangeCode('c', 'https://x.test/cb'),
      connector.listAdAccounts(TOKEN),
      connector.listPages(TOKEN),
      connector.healthCheck(TOKEN, 'a', 'p'),
      connector.createCampaign(TOKEN, SPEC),
      connector.updateCampaign(TOKEN, REFS, {}),
      connector.pause(TOKEN, REFS),
      connector.resume(TOKEN, REFS),
      connector.deleteCampaign(TOKEN, REFS),
      connector.getStatus(TOKEN, REFS),
      connector.fetchStats(TOKEN, REFS, { since: '2026-01-01', until: '2026-01-02' }),
      connector.fetchRejection(TOKEN, REFS),
    ];
    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ code: 'provider_unavailable', status: 503 });
    }
  });
});
