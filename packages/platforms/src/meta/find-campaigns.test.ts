import { describe, expect, it } from 'vitest';
import { failure, FakeGraph, type GraphHandler } from './fake-graph.test-helper';
import { MetaConnector } from './meta-connector';

// Rapprochement (EC-META-05) : retrouver chez Meta la campagne dont le nom porte la référence de publication de Pubeka.
// Lecture seule. Le filtre par nom (`filtering`) n'est PAS documenté pour cette liste : on lit les campagnes par pages (arête
// documentée https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/, `effective_status`, `fields`,
// pagination du Graph API) et on filtre côté Pubeka. Une liste coupée avant la fin ne permet JAMAIS de conclure « rien trouvé ».
const TOKEN = { accessToken: 'jeton-de-test', expiresAt: null };
const NOW = () => new Date('2026-10-17T10:00:00Z');
const BASE = 'pk-0123456789ab';

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

const campaign = (id: string, name: string, status = 'PAUSED') => ({
  id,
  name,
  effective_status: status,
});

describe('MetaConnector.findCampaignsByReference', () => {
  it('trouve la campagne dont le nom contient la référence, avec son ensemble, sa publicité et sa création', async () => {
    const { graph, meta } = connector((call) => {
      if (call.path === 'act_42/campaigns') {
        return {
          data: [
            campaign('1', 'Autre campagne'),
            campaign('2', `Promo baskets [${BASE}-1]`),
            campaign('3', 'Encore une autre'),
          ],
          paging: {},
        };
      }
      if (call.path === '2/ads') {
        return { data: [{ id: '22', adset_id: '12', creative: { id: '32' } }] };
      }
      return {};
    });
    const found = await meta.findCampaignsByReference(TOKEN, 'act_42', BASE);
    expect(found).toEqual({
      exhaustive: true,
      campaigns: [
        {
          campaignId: '2',
          name: `Promo baskets [${BASE}-1]`,
          effectiveStatus: 'PAUSED',
          adsetId: '12',
          adId: '22',
          creativeId: '32',
        },
      ],
    });
    // Lecture seule, et seulement les arêtes documentées.
    expect(graph.calls.every((c) => c.method === 'GET')).toBe(true);
    const list = graph.calls[0];
    expect(list?.params.fields).toBe('id,name,effective_status');
    expect(JSON.parse(list?.params.effective_status ?? '[]')).toEqual([
      'ACTIVE',
      'PAUSED',
      'IN_PROCESS',
      'WITH_ISSUES',
    ]);
  });

  it('ajoute le préfixe act_ à un numéro de compte seul', async () => {
    const { graph, meta } = connector(() => ({ data: [], paging: {} }));
    await meta.findCampaignsByReference(TOKEN, '42', BASE);
    expect(graph.calls[0]?.path).toBe('act_42/campaigns');
  });

  it('ne confond pas une référence avec une autre dont elle est le préfixe (pk-…-1 et pk-…-10)', async () => {
    const { meta } = connector((call) =>
      call.path === 'act_42/campaigns'
        ? { data: [campaign('2', `A [${BASE}-10]`), campaign('3', `B [${BASE}-1]`)], paging: {} }
        : { data: [] },
    );
    const exact = await meta.findCampaignsByReference(TOKEN, 'act_42', `${BASE}-1`);
    expect(exact.campaigns.map((c) => c.campaignId)).toEqual(['3']);
  });

  it('lit plusieurs pages et reste exhaustif quand la dernière page est atteinte', async () => {
    const { graph, meta } = connector((call) => {
      if (call.path === 'act_42/campaigns' && call.params.after === 'P2') {
        return { data: [campaign('2', `Y [${BASE}-1]`)], paging: {} };
      }
      if (call.path === 'act_42/campaigns') {
        return {
          data: [campaign('1', 'x')],
          paging: {
            next: 'https://graph.facebook.com/v26.0/act_42/campaigns?after=P2&access_token=jeton',
          },
        };
      }
      return { data: [] };
    });
    const found = await meta.findCampaignsByReference(TOKEN, 'act_42', BASE);
    expect(found.exhaustive).toBe(true);
    expect(found.campaigns.map((c) => c.campaignId)).toEqual(['2']);
    expect(graph.calls.filter((c) => c.path.endsWith('campaigns'))).toHaveLength(2);
  });

  it('une liste trop longue est coupée : non exhaustif, donc « rien trouvé » ne conclut pas', async () => {
    const { graph, meta } = connector(() => ({
      data: [campaign('1', 'x')],
      paging: {
        next: 'https://graph.facebook.com/v26.0/act_42/campaigns?after=ENCORE&access_token=jeton',
      },
    }));
    const found = await meta.findCampaignsByReference(TOKEN, 'act_42', BASE);
    expect(found.exhaustive).toBe(false);
    expect(found.campaigns).toEqual([]);
    expect(graph.calls.length).toBeLessThanOrEqual(25);
  });

  it('une campagne sans publicité est rendue avec des identifiants vides (création incomplète)', async () => {
    const { meta } = connector((call) =>
      call.path === 'act_42/campaigns'
        ? { data: [campaign('2', `Z [${BASE}-1]`)], paging: {} }
        : { data: [] },
    );
    const found = await meta.findCampaignsByReference(TOKEN, 'act_42', BASE);
    expect(found.campaigns[0]).toMatchObject({
      campaignId: '2',
      adsetId: null,
      adId: null,
      creativeId: null,
    });
  });

  it('une erreur de Meta sur la lecture est une erreur (la tâche ne conclut pas)', async () => {
    const { meta } = connector(() => failure({ code: 190, message: 'x' }, 401));
    await expect(meta.findCampaignsByReference(TOKEN, 'act_42', BASE)).rejects.toMatchObject({
      code: 'meta_token_expired',
    });
  });

  it('refuse une référence vide ou trop courte : elle correspondrait à toutes les campagnes du compte', async () => {
    const { graph, meta } = connector(() => ({ data: [], paging: {} }));
    for (const reference of ['', 'pk', '   ']) {
      await expect(meta.findCampaignsByReference(TOKEN, 'act_42', reference)).rejects.toMatchObject(
        {
          code: 'validation_failed',
        },
      );
    }
    expect(graph.calls).toHaveLength(0);
  });
});
