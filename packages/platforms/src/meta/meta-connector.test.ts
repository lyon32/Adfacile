import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import { CONTRACT_SPEC } from '../contract/platform-connector.contract';
import { failure, FakeGraph, type GraphHandler } from './fake-graph.test-helper';
import { decimalToCents, META_SCOPES, MetaConnector } from './meta-connector';

const REDIRECT_URI = 'https://exemple.trycloudflare.com/api/facebook/callback';
const APP_ID = '1982764035683375';
const TOKEN = { accessToken: 'JETON', expiresAt: null };
const NOW = () => new Date('2026-10-01T00:00:00Z');
const REFS = {
  campaignId: 'C1',
  adsetId: 'A1',
  adId: 'AD1',
  creativeId: 'CR1',
  adAccountId: 'act_1',
};

function connecteur(
  handler: GraphHandler = () => ({}),
  extra: Partial<ConstructorParameters<typeof MetaConnector>[0]> = {},
) {
  const graph = new FakeGraph(handler);
  return {
    graph,
    meta: new MetaConnector({
      appId: APP_ID,
      appSecret: 'secret-de-test',
      now: NOW,
      fetch: graph.fetch,
      ...extra,
    }),
  };
}

// Tests portés de backend/src/controllers/facebookController.test.js (getAuthUrl, TR-PLA-02). Le `state` signé
// et à usage unique relève de S11 (oauthState) : le connecteur le transporte sans le fabriquer.
describe('MetaConnector.authorizeUrl', () => {
  const SCOPES_ATTENDUS = [
    'pages_show_list',
    'ads_management',
    'ads_read',
    'business_management',
    'pages_read_engagement',
    'instagram_basic',
    'whatsapp_business_management',
  ];

  it('Facebook Login for Business : config_id remplace scope quand il est configuré', () => {
    // Relevé réel (8 oct. 2026) : l'app « Entreprise » renvoyait « Feature Unavailable » au dialogue appelé avec scope.
    const url = new URL(
      connecteur(undefined, { loginConfigId: '1588765496066346' }).meta.authorizeUrl(
        'etat',
        REDIRECT_URI,
      ),
    );
    expect(url.searchParams.get('config_id')).toBe('1588765496066346');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
  });

  it('cible le dialogue OAuth de la version configurée', () => {
    const url = new URL(
      connecteur(undefined, { graphVersion: 'v23.0' }).meta.authorizeUrl('etat', REDIRECT_URI),
    );
    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.pathname).toBe('/v23.0/dialog/oauth');
    expect(new URL(connecteur().meta.authorizeUrl('e', REDIRECT_URI)).pathname).toBe(
      '/v26.0/dialog/oauth',
    );
  });

  it('transmet le client_id, le redirect_uri exact et le state', () => {
    const url = new URL(connecteur().meta.authorizeUrl('etat-signe', REDIRECT_URI));
    expect(url.searchParams.get('client_id')).toBe(APP_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe('etat-signe');
    expect(url.searchParams.get('auth_type')).toBe('rerequest');
  });

  it('demande les permissions attendues, sans en omettre', () => {
    const url = new URL(connecteur().meta.authorizeUrl('etat', REDIRECT_URI));
    expect(url.searchParams.get('scope')?.split(',')).toEqual(SCOPES_ATTENDUS);
    expect(META_SCOPES).toEqual(SCOPES_ATTENDUS);
  });

  it("ne met jamais le secret de l'application dans l'URL", () => {
    expect(connecteur().meta.authorizeUrl('etat', REDIRECT_URI)).not.toContain('secret-de-test');
  });
});

describe('MetaConnector.exchangeCode', () => {
  it('échange le code puis le jeton court contre un jeton de 60 jours', async () => {
    const { graph, meta } = connecteur((call) =>
      call.params.grant_type === 'fb_exchange_token'
        ? { access_token: 'LONG', expires_in: 5184000 }
        : { access_token: 'COURT', expires_in: 3600 },
    );
    const token = await meta.exchangeCode('CODE', REDIRECT_URI);
    expect(token).toEqual({ accessToken: 'LONG', expiresAt: new Date('2026-11-30T00:00:00Z') });
    expect(graph.calls[0]?.params).toMatchObject({
      code: 'CODE',
      redirect_uri: REDIRECT_URI,
      client_id: APP_ID,
    });
    expect(graph.calls[1]?.params).toMatchObject({ fb_exchange_token: 'COURT' });
  });

  it('accepte un jeton sans date d’expiration (utilisateur système)', async () => {
    const { meta } = connecteur(() => ({ access_token: 'T' }));
    expect((await meta.exchangeCode('c', REDIRECT_URI)).expiresAt).toBeNull();
  });

  it('un refus de Meta devient meta_error, sans le secret ni le code dans le message', async () => {
    const { meta } = connecteur(() => failure({ code: 100, message: 'Invalid verification code' }));
    const erreur = await meta.exchangeCode('CODE', REDIRECT_URI).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(AppError);
    expect(erreur).toMatchObject({ code: 'meta_error' });
    expect((erreur as AppError).message).not.toMatch(/secret|CODE/);
  });
});

describe('MetaConnector — comptes et Pages', () => {
  it('liste les comptes avec leurs ensembles de données, et les Pages', async () => {
    const { meta } = connecteur((call) => {
      if (call.path === 'me/adaccounts')
        return { data: [{ id: 'act_1', name: 'Lyon', account_status: 1, currency: 'USD' }] };
      if (call.path === 'me/accounts') return { data: [{ id: 'P1', name: 'Page' }] };
      return { data: [{ id: 'px' }] };
    });
    expect((await meta.listAdAccounts(TOKEN))[0]).toMatchObject({
      id: 'act_1',
      usable: true,
      pixelsCount: 1,
    });
    expect(await meta.listPages(TOKEN)).toEqual([{ id: 'P1', name: 'Page', category: null }]);
  });

  it('jeton révoqué → meta_token_expired', async () => {
    const { meta } = connecteur(() =>
      failure({ code: 190, error_subcode: 460, message: 'x' }, 401),
    );
    await expect(meta.listAdAccounts(TOKEN)).rejects.toMatchObject({
      code: 'meta_token_expired',
      status: 424,
    });
  });
});

describe('MetaConnector.healthCheck (F1)', () => {
  const sante: GraphHandler = (call) => {
    if (call.path === 'me/adaccounts')
      return { data: [{ id: 'act_1', name: 'Lyon', account_status: 1 }] };
    if (call.path === 'me/accounts') return { data: [{ id: 'P1', name: 'Page' }] };
    if (call.path === 'act_1' && call.params.fields === 'funding_source')
      return { funding_source: '123' };
    if (call.path === 'P1')
      return { instagram_business_account: { id: 'IG' }, whatsapp_business_account: { id: 'WA' } };
    if (call.path.endsWith('adspixels')) return { data: [{ id: 'px' }] };
    if (call.path === 'me/permissions')
      return { data: META_SCOPES.map((permission) => ({ permission, status: 'granted' })) };
    return { data: [] };
  };

  it('rend tout au vert pour un compte complet, sans jeton dans le détail', async () => {
    const items = await connecteur(sante).meta.healthCheck(TOKEN, '1', 'P1');
    expect(Object.fromEntries(items.map((i) => [i.key, i.status]))).toEqual({
      ad_account: 'ok',
      payment_method: 'ok',
      page: 'ok',
      instagram: 'ok',
      whatsapp: 'ok',
      pixel: 'ok',
      permissions: 'ok',
    });
    expect(JSON.stringify(items)).not.toContain('JETON');
  });

  it('signale ce qui manque : paiement, Page, Instagram, WhatsApp, pixel, permissions', async () => {
    const vide = connecteur((call) => {
      if (call.path === 'me/permissions')
        return { data: [{ permission: 'ads_read', status: 'granted' }] };
      return { data: [] };
    });
    const items = await vide.meta.healthCheck(TOKEN, '1', 'P1');
    const statuts = Object.fromEntries(items.map((i) => [i.key, i.status]));
    expect(statuts).toMatchObject({
      ad_account: 'missing',
      payment_method: 'missing',
      page: 'missing',
      instagram: 'missing',
      whatsapp: 'missing',
      pixel: 'missing',
      permissions: 'warning',
    });
    expect(items.find((i) => i.key === 'permissions')?.detail?.missing).toContain('ads_management');
  });

  it('prévient quand le compte est inutilisable ou que les pixels sont à partager', async () => {
    const { meta } = connecteur((call) => {
      if (call.path === 'me/adaccounts')
        return { data: [{ id: 'act_1', name: 'Lyon', account_status: 2 }] };
      if (call.path.endsWith('adspixels')) return { data: [] };
      if (call.path === 'act_1') return { funding_source: '1', business: { id: 'B' } };
      if (call.path === 'B/owned_pixels') return { data: [{ id: 'px2' }] };
      return { data: [] };
    });
    const items = await meta.healthCheck(TOKEN, 'act_1', 'P1');
    expect(items.find((i) => i.key === 'ad_account')).toMatchObject({
      status: 'warning',
      detail: { label: 'Désactivé' },
    });
    expect(items.find((i) => i.key === 'pixel')).toMatchObject({
      status: 'warning',
      detail: { unattached: 1 },
    });
  });

  it('jeton révoqué → meta_token_expired', async () => {
    const { meta } = connecteur(() => failure({ code: 190, message: 'x' }, 401));
    await expect(meta.healthCheck(TOKEN, '1', 'P1')).rejects.toMatchObject({
      code: 'meta_token_expired',
    });
  });
});

describe('MetaConnector — campagne', () => {
  it('crée une campagne complète et renvoie ses identifiants', async () => {
    const etapes: string[] = [];
    const { meta } = connecteur(
      (call) =>
        call.method === 'POST'
          ? { id: `${call.path.split('/').pop() ?? ''}-id` }
          : { timezone_name: 'Africa/Douala' },
      { onStep: (n) => etapes.push(n), xafPerUsd: 600, upload: {} },
    );
    const refs = await meta.createCampaign(TOKEN, CONTRACT_SPEC);
    expect(refs).toMatchObject({ campaignId: 'campaigns-id', adId: 'ads-id' });
    expect(etapes).toContain('publicite');
  });

  it('convertit une validation Pubeka en validation_failed et un budget trop bas en budget_too_low', async () => {
    const { graph, meta } = connecteur();
    await expect(
      meta.createCampaign(TOKEN, { ...CONTRACT_SPEC, targeting: { locations: [] } }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(
      meta.createCampaign(TOKEN, { ...CONTRACT_SPEC, dailyBudgetUsdCents: 50 }),
    ).rejects.toMatchObject({
      code: 'budget_too_low',
      status: 422,
    });
    expect(graph.calls).toHaveLength(0);
  });

  it('refus de paiement de Meta → meta_payment_method_missing, après annulation', async () => {
    const { graph, meta } = connecteur((call) => {
      if (call.method === 'DELETE') return { success: true };
      if (call.path.endsWith('/adsets')) return failure({ code: 2635, message: 'x' });
      if (call.method === 'POST') return { id: 'C' };
      return { timezone_name: 'UTC' };
    });
    await expect(meta.createCampaign(TOKEN, CONTRACT_SPEC)).rejects.toMatchObject({
      code: 'meta_payment_method_missing',
    });
    expect(graph.find('DELETE', 'C')).toHaveLength(1);
  });

  it('pause, reprise, modification et suppression passent par Meta, du bon niveau', async () => {
    const { graph, meta } = connecteur(() => ({ success: true, timezone_name: 'UTC' }));
    await meta.pause(TOKEN, REFS);
    await meta.resume(TOKEN, REFS);
    await meta.updateCampaign(TOKEN, REFS, { name: 'N' });
    expect(await meta.deleteCampaign(TOKEN, REFS)).toBe(true);
    const chemins = graph.calls.map((c) => `${c.method} ${c.path}`);
    expect(chemins).toEqual([
      'POST AD1',
      'POST A1',
      'POST C1',
      'POST C1',
      'POST A1',
      'POST AD1',
      'POST C1',
      'DELETE C1',
      'DELETE CR1',
    ]);
  });

  it('une erreur Graph devient une AppError pour chaque opération', async () => {
    const { meta } = connecteur(() => failure({ code: 17, message: 'x' }));
    for (const call of [
      meta.pause(TOKEN, REFS),
      meta.resume(TOKEN, REFS),
      meta.updateCampaign(TOKEN, REFS, { name: 'N' }),
      meta.deleteCampaign(TOKEN, REFS),
      meta.getStatus(TOKEN, REFS),
      meta.fetchStats(TOKEN, REFS, { since: '2026-10-01', until: '2026-10-02' }),
      meta.fetchRejection(TOKEN, REFS),
    ]) {
      await expect(call).rejects.toMatchObject({ code: 'meta_error', status: 502 });
    }
  });
});

describe('MetaConnector.getStatus', () => {
  it.each([
    ['ACTIVE', 'active'],
    ['PAUSED', 'paused'],
    ['CAMPAIGN_PAUSED', 'paused'],
    ['ADSET_PAUSED', 'paused'],
    ['PENDING_REVIEW', 'in_review'],
    ['PREAPPROVED', 'in_review'],
    ['IN_PROCESS', 'in_review'],
    ['DISAPPROVED', 'rejected'],
    ['DELETED', 'stopped'],
    ['ARCHIVED', 'stopped'],
    ['WITH_ISSUES', 'error'],
    ['PENDING_BILLING_INFO', 'error'],
    ['QUELQUE_CHOSE_DE_NEUF', 'error'],
  ])('traduit %s en %s', async (raw, attendu) => {
    const { meta } = connecteur(() => ({ effective_status: raw }));
    expect(await meta.getStatus(TOKEN, REFS)).toEqual({ status: attendu, rawStatus: raw });
  });

  it('lit la publicité, à défaut la campagne, et signale un statut absent', async () => {
    const { graph, meta } = connecteur(() => ({}));
    expect((await meta.getStatus(TOKEN, { ...REFS, adId: null })).rawStatus).toBe('UNKNOWN');
    expect(graph.calls[0]?.path).toBe('C1');
  });
});

describe('MetaConnector.fetchStats', () => {
  it('lit les insights jour par jour et convertit en entiers (centimes, compteurs)', async () => {
    const { graph, meta } = connecteur(() => ({
      data: [
        {
          date_start: '2026-10-01',
          impressions: '1200',
          reach: '900',
          clicks: '45',
          spend: '12.345',
          frequency: '1.33',
          ctr: '3.75',
          cpm: '10.29',
          actions: [
            { action_type: 'link_click', value: '40' },
            { action_type: 'lead', value: '3' },
          ],
        },
        { date_start: '2026-10-02' },
      ],
    }));
    const days = await meta.fetchStats(TOKEN, REFS, { since: '2026-10-01', until: '2026-10-02' });
    expect(days[0]).toEqual({
      date: '2026-10-01',
      spendUsdCents: 1235,
      impressions: 1200,
      reach: 900,
      clicks: 45,
      results: 3,
      resultType: 'lead',
      cpmUsdCents: 1029,
      ctr: 3.75,
      frequency: 1.33,
    });
    expect(days[1]).toMatchObject({
      spendUsdCents: 0,
      results: 0,
      resultType: null,
      cpmUsdCents: null,
      ctr: null,
    });
    expect(graph.calls[0]?.params).toMatchObject({
      time_increment: '1',
      level: 'campaign',
      time_range: JSON.stringify({ since: '2026-10-01', until: '2026-10-02' }),
    });
  });

  it('renvoie une liste vide quand Meta n’a rien', async () => {
    expect(
      await connecteur(() => ({})).meta.fetchStats(TOKEN, REFS, {
        since: '2026-10-01',
        until: '2026-10-02',
      }),
    ).toEqual([]);
  });

  it('decimalToCents ne passe jamais par un flottant et ignore ce qui n’est pas un montant', () => {
    expect(decimalToCents('0.1')).toBe(10);
    expect(decimalToCents('1.005')).toBe(101);
    expect(decimalToCents('7')).toBe(700);
    expect(decimalToCents('-2.50')).toBe(-250);
    expect(decimalToCents('3.')).toBe(300);
    expect(decimalToCents('abc')).toBe(0);
    expect(decimalToCents(undefined)).toBe(0);
  });
});

describe('MetaConnector.fetchRejection', () => {
  it('renvoie le motif d’une publicité refusée', async () => {
    const { meta } = connecteur(() => ({
      effective_status: 'DISAPPROVED',
      ad_review_feedback: { global: { '2490010': 'Texte trop promotionnel' } },
    }));
    expect(await meta.fetchRejection(TOKEN, REFS)).toEqual({
      reason: 'Texte trop promotionnel',
      adId: 'AD1',
    });
  });

  it('donne un motif par défaut quand Meta n’en fournit pas, et null si la publicité n’est pas refusée', async () => {
    const sans = connecteur(() => ({
      effective_status: 'DISAPPROVED',
      ad_review_feedback: { global: {} },
    }));
    expect((await sans.meta.fetchRejection(TOKEN, REFS))?.reason).toMatch(/sans motif/);
    expect(
      await connecteur(() => ({ effective_status: 'ACTIVE' })).meta.fetchRejection(TOKEN, REFS),
    ).toBeNull();
    expect(await connecteur().meta.fetchRejection(TOKEN, { ...REFS, adId: null })).toBeNull();
  });
});
