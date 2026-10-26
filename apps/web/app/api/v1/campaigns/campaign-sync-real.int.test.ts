// Synchronisation de S17 de bout en bout sur la VRAIE base locale, avec la FAUSSE Meta et la tâche lancée `inline` (aucun appel
// réel, aucun enregistreur de tâches) : « Actualiser » → route → tâche → statistiques écrites en base → relues par la route.
// Né d'un défaut que les tests précédents ne voyaient pas : `stats_daily` est publiée en Realtime (migration 0015) sans clé
// primaire, donc tout UPDATE échouait sur une vraie base (corrigé par la migration 0017). La 2e passe du même jour est ce test.
// Chiffres D'ESSAI (le produit n'en contient aucun).
import {
  createFullMetaConnector,
  createSyncDeps,
  FakeMetaConnector,
  MetaGraphError,
  syncCampaignStatuses,
} from '@pubeka/core';
import { calendarDateIn, getEnv } from '@pubeka/shared';
import { seedWorkspace, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call } from '../meta/int-support';
import { GET as statsRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/stats/route';
import { POST as refreshRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/stats/refresh/route';
import { campaignParams, ensureTestFx, json, resetRateLimits } from './int-support';
import { campaignRow, publishedCampaign } from './publish-support';
import { overridePublishDeps, overrideSyncJobs } from './services';

type Refs = Parameters<FakeMetaConnector['seedStats']>[0];
type DailyStats = Parameters<FakeMetaConnector['seedStats']>[1][number];

let s: SeededWorkspace;

beforeAll(async () => {
  s = await seedWorkspace();
  await ensureTestFx('XAF', 600);
});
beforeEach(async () => {
  await resetRateLimits();
  // Dépendances NORMALES : tâche `inline` + fausse Meta partagée avec la tâche de synchronisation.
  overridePublishDeps(undefined);
  overrideSyncJobs(undefined);
});
afterAll(() => {
  overrideSyncJobs(undefined);
  overridePublishDeps(undefined);
});

function fakeMeta(): FakeMetaConnector {
  const connector = createFullMetaConnector(getEnv(), () => new Date());
  if (!(connector instanceof FakeMetaConnector)) {
    throw new Error(
      'PUBEKA_FAKE_PROVIDERS doit contenir « meta » : ce test n’appelle jamais le vrai Meta',
    );
  }
  return connector;
}

async function refsOf(campaignId: string): Promise<Refs> {
  const r = await svc().from('campaigns').select('meta_campaign_id').eq('id', campaignId).single();
  expect(r.error).toBeNull();
  // La fausse Meta retrouve une campagne par son seul identifiant de campagne.
  return {
    campaignId: r.data?.meta_campaign_id ?? '',
    adsetId: null,
    adId: null,
    creativeId: null,
  };
}

/** Quatre jours récents (UTC) : la tâche garde ceux de sa fenêtre, dans le fuseau du compte. */
function days(results: number, spendUsdCents: number): DailyStats[] {
  return [0, 1, 2, 3].map((back) => ({
    date: calendarDateIn(new Date(Date.now() - back * 86_400_000), 'UTC'),
    spendUsdCents,
    impressions: 1000,
    reach: 800,
    clicks: 30,
    results,
    resultType: 'onsite_conversion.messaging_conversation_started_7d',
    cpmUsdCents: null,
    ctr: null,
    frequency: null,
  }));
}

const svc = () => testServiceClient();

async function statRows(campaignId: string) {
  const r = await svc()
    .from('stats_daily')
    .select('date, results, spend_usd_cents, synced_at')
    .eq('campaign_id', campaignId)
    .is('ad_id', null)
    .order('date');
  expect(r.error).toBeNull();
  return r.data ?? [];
}

/** Rouvre la fenêtre de 5 minutes de « Actualiser » (la limite est appliquée par la base, TR-PLA-06). */
async function reopenRefreshWindow(campaignId: string): Promise<void> {
  const r = await svc()
    .from('campaigns')
    .update({ stats_refresh_requested_at: null })
    .eq('id', campaignId);
  expect(r.error).toBeNull();
}

const refresh = (campaignId: string) =>
  refreshRoute(
    call(
      'POST',
      `/workspaces/${s.workspace.id}/campaigns/${campaignId}/stats/refresh`,
      s.owner.headers,
    ),
    campaignParams(s.workspace.id, campaignId),
  );

const readStats = async (campaignId: string) =>
  await json(
    await statsRoute(
      call('GET', `/workspaces/${s.workspace.id}/campaigns/${campaignId}/stats`, s.owner.headers),
      campaignParams(s.workspace.id, campaignId),
    ),
  );

describe('TR-PLA-06 · « Actualiser » de bout en bout (vraie base, fausse Meta, tâche inline)', () => {
  it('1re passe = INSERT, 2e passe du même jour = UPDATE (réplication Realtime de stats_daily, migration 0017)', async () => {
    const { campaign } = await publishedCampaign(s);
    const refs = await refsOf(campaign.id);
    const fake = fakeMeta();

    fake.seedStats(refs, days(10, 1000));
    expect((await refresh(campaign.id)).status).toBe(202);
    const first = await statRows(campaign.id);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((row) => row.results === 10)).toBe(true);

    // Meta a de nouveaux chiffres pour les mêmes jours : la 2e passe MODIFIE les lignes (le chemin qui était cassé).
    await reopenRefreshWindow(campaign.id);
    fake.seedStats(refs, days(25, 2500));
    expect((await refresh(campaign.id)).status).toBe(202);
    const second = await statRows(campaign.id);
    expect(second.map((row) => row.date)).toEqual(first.map((row) => row.date));
    expect(second.every((row) => row.results === 25)).toBe(true);
    // La dépense est convertie dans la monnaie de l'espace : elle a bien changé avec les nouveaux chiffres de Meta.
    expect(second[0]?.spend_usd_cents).toBeGreaterThan(first[0]?.spend_usd_cents ?? Infinity);

    const body = await readStats(campaign.id);
    expect(body.sync_error).toBeNull();
  });
});

describe('EC-META-10 · limite de débit de Meta pendant « Actualiser »', () => {
  it('garde les dernières valeurs et le dit (sync_error = rate_limited), sans rien effacer', async () => {
    const { campaign } = await publishedCampaign(s);
    const refs = await refsOf(campaign.id);
    const fake = fakeMeta();

    fake.seedStats(refs, days(10, 1000));
    expect((await refresh(campaign.id)).status).toBe(202);
    const before = await statRows(campaign.id);
    expect(before.length).toBeGreaterThan(0);

    await reopenRefreshWindow(campaign.id);
    const original = fake.fetchStats.bind(fake);
    // Code 17 : limite de débit du compte publicitaire (documentation « Marketing API Rate Limiting »).
    fake.fetchStats = () =>
      Promise.reject(new MetaGraphError({ code: 17, message: 'limite' }, 400));
    try {
      expect((await refresh(campaign.id)).status).toBe(202);
    } finally {
      fake.fetchStats = original;
    }
    expect(await statRows(campaign.id)).toEqual(before);
    expect((await readStats(campaign.id)).sync_error).toBe('rate_limited');
  });
});

describe('TR-PLA-05 · EC-META-08 · statuts relus chez Meta par la tâche', () => {
  async function signal(workspaceId: string, campaignId: string, status: string): Promise<void> {
    // Ce que fait le webhook : un signal journalisé. Le statut, lui, est RELU chez Meta.
    const r = await svc().from('campaign_status_events').insert({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      status,
      source: 'webhook',
      payload: null,
    });
    expect(r.error).toBeNull();
  }
  const run = () =>
    syncCampaignStatuses(
      { requestId: 'req_s17_real', svc: svc(), now: () => new Date() },
      createSyncDeps(getEnv(), () => new Date()),
      { scope: 'webhook' },
    );

  it('en vérification → en diffusion quand Meta approuve', async () => {
    const { campaign } = await publishedCampaign(s);
    const refs = await refsOf(campaign.id);
    fakeMeta().simulateRemoteStatus(refs, { status: 'active', rawStatus: 'ACTIVE' });
    await signal(s.workspace.id, campaign.id, 'in_review');
    await run();
    expect((await campaignRow(campaign.id))?.status).toBe('active');
  });

  it('EC-META-08 · supprimée chez Meta pendant la vérification → arrêtée (stopped)', async () => {
    const { campaign } = await publishedCampaign(s);
    const refs = await refsOf(campaign.id);
    fakeMeta().simulateRemoteStatus(refs, { status: 'stopped', rawStatus: 'DELETED' });
    await signal(s.workspace.id, campaign.id, 'in_review');
    await run();
    expect((await campaignRow(campaign.id))?.status).toBe('stopped');
  });
});
