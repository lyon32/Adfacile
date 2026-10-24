// Lectures de la page de campagne (Résultats, Pubs, Historique), de la liste, du tableau de bord et du bouton « Actualiser ».
// TR-PLA-06 : bouton « Actualiser » limité à 1 fois / 5 minutes. F7 : résultat traduit en argent. Chiffres et taux D'ESSAI.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import type { MemberCtx } from '../../context';
import { OTHER_W } from '../campaigns.test-helper';
import { RecordingJobs } from '../publish/publish.test-helper';
import { getCampaignStats, resolveRange } from './campaign-stats';
import { listCampaignAds, listCampaignEvents, listCampaigns } from './campaign-lists';
import { getOverview, parseOverviewRange } from './overview';
import { requestStatsRefresh, REFRESH_WINDOW_S, SYNC_STATS_TASK } from './refresh-stats';
import { MIN, NOW, rowOf, syncWorld, W, type SyncWorld } from './sync.test-helper';

const CONV = 'onsite_conversion.messaging_conversation_started_7d';

function seed(
  s: SyncWorld,
  rows: { date: string; spend: number; results: number; type?: string | null }[],
): void {
  for (const r of rows) {
    s.w.db.rows('stats_daily').push({
      workspace_id: W,
      campaign_id: s.id,
      ad_id: null,
      date: r.date,
      spend_usd_cents: r.spend,
      impressions: 1000,
      reach: 800,
      clicks: 30,
      results: r.results,
      result_type: r.type === undefined ? CONV : r.type,
    });
  }
}

const at = (ctx: MemberCtx, minutes: number): MemberCtx => ({
  ...ctx,
  now: () => new Date(NOW.getTime() + minutes * MIN),
});

describe('TR-PLA-06 — bouton « Actualiser » : 1 fois toutes les 5 minutes', () => {
  it('première demande : acceptée, la tâche est lancée avec les identifiants seulement', async () => {
    const s = await syncWorld();
    const jobs = new RecordingJobs();
    const result = await requestStatsRefresh(s.w.ctx, s.id, jobs);
    expect(result).toEqual({ status: 'queued', requested_at: NOW.toISOString() });
    expect(jobs.jobs).toEqual([
      {
        taskId: SYNC_STATS_TASK,
        payload: { campaignId: s.id, workspaceId: W },
        key: `${SYNC_STATS_TASK}:${s.id}:${NOW.toISOString()}`,
      },
    ]);
  });

  it('deuxième demande moins de 5 minutes après : 429 rate_limited avec le délai restant, aucune tâche lancée', async () => {
    const s = await syncWorld();
    const jobs = new RecordingJobs();
    await requestStatsRefresh(s.w.ctx, s.id, jobs);
    const error = await requestStatsRefresh(at(s.w.ctx, 2), s.id, jobs).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'rate_limited', status: 429, opts: { retryAfterS: 180 } });
    expect(jobs.jobs).toHaveLength(1);
  });

  it('5 minutes après : acceptée de nouveau', async () => {
    const s = await syncWorld();
    const jobs = new RecordingJobs();
    await requestStatsRefresh(s.w.ctx, s.id, jobs);
    await requestStatsRefresh(at(s.w.ctx, REFRESH_WINDOW_S / 60), s.id, jobs);
    expect(jobs.jobs).toHaveLength(2);
  });

  it('si le lancement de la tâche échoue : 503 et la fenêtre est RENDUE (le client peut réessayer tout de suite)', async () => {
    const s = await syncWorld();
    const jobs = new RecordingJobs();
    jobs.failWith = new Error('file indisponible');
    await expect(requestStatsRefresh(s.w.ctx, s.id, jobs)).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
    expect(rowOf(s.w.db, s.id).stats_refresh_requested_at ?? null).toBeNull();
    jobs.failWith = undefined;
    await expect(requestStatsRefresh(s.w.ctx, s.id, jobs)).resolves.toMatchObject({
      status: 'queued',
    });
  });

  it('campagne d’un autre espace ou inconnue : 404 (jamais 403), campagne jamais publiée chez Meta : 409', async () => {
    const s = await syncWorld();
    const other: MemberCtx = { ...s.w.ctx, workspace: { ...s.w.ctx.workspace, id: OTHER_W } };
    await expect(requestStatsRefresh(other, s.id, new RecordingJobs())).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      requestStatsRefresh(s.w.ctx, '00000000-0000-4000-8000-00000000ffff', new RecordingJobs()),
    ).rejects.toMatchObject({ code: 'not_found' });
    rowOf(s.w.db, s.id).meta_campaign_id = null;
    await expect(requestStatsRefresh(s.w.ctx, s.id, new RecordingJobs())).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('un lecteur peut actualiser (lecture seule chez Meta) : tout membre', async () => {
    const s = await syncWorld();
    const viewer: MemberCtx = { ...s.w.ctx, workspace: { ...s.w.ctx.workspace, role: 'viewer' } };
    await expect(requestStatsRefresh(viewer, s.id, new RecordingJobs())).resolves.toMatchObject({
      status: 'queued',
    });
  });
});

describe('F7 — résultat traduit en argent', () => {
  it('« 42 résultats de conversation WhatsApp, X FCFA chacun » : totaux, coût par résultat, FCFA et dollars', async () => {
    const s = await syncWorld();
    seed(s, [
      { date: '2026-10-10', spend: 3000, results: 20 },
      { date: '2026-10-11', spend: 3000, results: 22 },
    ]);
    const view = await getCampaignStats(s.w.ctx, s.id, { from: '2026-10-01', to: '2026-10-12' });
    expect(view.summary).toMatchObject({
      results: 42,
      result_kind: 'whatsapp_conversation',
      spend: { usd_cents: 6000, local_minor: 36_000, currency: 'XAF' },
      // 6 000 centimes = 60 $ = 36 000 FCFA (taux d'essai 600) ; ÷ 42 = 857,14 → 857 FCFA ; 6 000 ÷ 42 = 142,86 → 143 centimes.
      cost_per_result: { usd_cents: 143, local_minor: 857, currency: 'XAF' },
      impressions: 2000,
      clicks: 60,
      ctr: 3,
    });
    expect(view.fx).toMatchObject({ status: 'ok', currency: 'XAF' });
    expect(view.daily.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('taux de plus de 48 h : le dollar seul, aucun montant local (fx_not_available)', async () => {
    const s = await syncWorld();
    seed(s, [{ date: '2026-10-11', spend: 3000, results: 20 }]);
    const rate = s.w.db.rows('exchange_rates')[0];
    if (rate !== undefined) rate.fetched_at = '2026-10-05T08:00:00Z';
    const view = await getCampaignStats(s.w.ctx, s.id, { from: '2026-10-01', to: '2026-10-12' });
    expect(view.summary.spend).toEqual({ usd_cents: 3000, local_minor: null, currency: null });
    expect(view.summary.cost_per_result).toEqual({
      usd_cents: 150,
      local_minor: null,
      currency: null,
    });
    expect(view.fx.status).toBe('fx_not_available');
  });

  it('aucune donnée : zéro, pas de coût par résultat, jamais de division par zéro', async () => {
    const s = await syncWorld();
    const view = await getCampaignStats(s.w.ctx, s.id);
    expect(view.summary).toMatchObject({
      results: 0,
      result_kind: null,
      cost_per_result: null,
      ctr: null,
      frequency: null,
    });
    expect(view.synced_at).toBeNull();
  });

  it('EC-META-10 : la dernière valeur reste, avec l’heure de la dernière copie réussie et la raison de l’échec', async () => {
    const s = await syncWorld();
    seed(s, [{ date: '2026-10-11', spend: 3000, results: 20 }]);
    Object.assign(rowOf(s.w.db, s.id), {
      stats_synced_at: '2026-10-12T07:00:00Z',
      stats_sync_error: 'rate_limited',
    });
    const view = await getCampaignStats(s.w.ctx, s.id, { from: '2026-10-01', to: '2026-10-12' });
    expect(view.synced_at).toBe('2026-10-12T07:00:00Z');
    expect(view.sync_error).toBe('rate_limited');
    expect(view.summary.results).toBe(20);
  });

  it('une campagne d’un autre espace est introuvable (404) ; période invalide ou trop longue : 400', async () => {
    const s = await syncWorld();
    const other: MemberCtx = { ...s.w.ctx, workspace: { ...s.w.ctx.workspace, id: OTHER_W } };
    await expect(getCampaignStats(other, s.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(() => resolveRange({ from: 'hier' }, NOW)).toThrow(AppError);
    expect(() => resolveRange({ from: '2026-10-12', to: '2026-10-01' }, NOW)).toThrow(AppError);
    expect(() => resolveRange({ from: '2024-01-01', to: '2026-10-12' }, NOW)).toThrow(AppError);
    expect(resolveRange({}, NOW)).toEqual({ from: '2026-09-13', to: '2026-10-12' });
  });

  it('seules les lignes de la campagne et de l’espace comptent (pas les publicités ni une autre campagne)', async () => {
    const s = await syncWorld();
    seed(s, [{ date: '2026-10-11', spend: 3000, results: 20 }]);
    s.w.db.rows('stats_daily').push(
      {
        workspace_id: W,
        campaign_id: 'autre',
        ad_id: null,
        date: '2026-10-11',
        spend_usd_cents: 99999,
        impressions: 1,
        reach: 1,
        clicks: 1,
        results: 1,
        result_type: CONV,
      },
      {
        workspace_id: W,
        campaign_id: s.id,
        ad_id: 'une-pub',
        date: '2026-10-11',
        spend_usd_cents: 88888,
        impressions: 1,
        reach: 1,
        clicks: 1,
        results: 1,
        result_type: CONV,
      },
    );
    const view = await getCampaignStats(s.w.ctx, s.id, { from: '2026-10-01', to: '2026-10-12' });
    expect(view.summary.spend.usd_cents).toBe(3000);
  });
});

describe('Tableau de bord (APPFLOW §7) et bandeau (PRD §10.1)', () => {
  it('compteurs par statut, dépensé ce mois (FCFA et dollars), tableau avec résultat et coût par résultat', async () => {
    const s = await syncWorld();
    rowOf(s.w.db, s.id).status = 'active';
    seed(s, [
      { date: '2026-09-30', spend: 9999, results: 99 }, // mois précédent : pas dans « ce mois »
      { date: '2026-10-10', spend: 3000, results: 20 },
      { date: '2026-10-11', spend: 3000, results: 22 },
    ]);
    const view = await getOverview(s.w.ctx, 'month');
    expect(view.counts).toEqual({ active: 1, in_review: 0, paused: 0, stopped: 0, other: 0 });
    expect(view.month).toBe('2026-10');
    expect(view.spent_month).toEqual({ usd_cents: 6000, local_minor: 36_000, currency: 'XAF' });
    expect(view.campaigns).toHaveLength(1);
    expect(view.campaigns[0]).toMatchObject({
      id: s.id,
      status: 'active',
      results: 42,
      result_kind: 'whatsapp_conversation',
    });
    // Mois sélectionné : du 1er à aujourd'hui (fuseau de la personne).
    expect(view.chart[0]).toEqual({ date: '2026-10-01', results: 0, spend_usd_cents: 0 });
    expect(view.chart.find((d) => d.date === '2026-10-11')).toEqual({
      date: '2026-10-11',
      results: 22,
      spend_usd_cents: 3000,
    });
    expect(view.chart.at(-1)?.date).toBe('2026-10-12');
  });

  it('semaine : les 7 derniers jours, jours vides à zéro', async () => {
    const s = await syncWorld();
    seed(s, [{ date: '2026-10-11', spend: 3000, results: 22 }]);
    const view = await getOverview(s.w.ctx, 'week');
    expect(view.chart.map((d) => d.date)).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
    expect(view.chart.filter((d) => d.results > 0)).toHaveLength(1);
  });

  it('aucune campagne : compteurs à zéro, aucun tableau, dépensé à zéro', async () => {
    const s = await syncWorld();
    s.w.db.tables.campaigns = [];
    const view = await getOverview(s.w.ctx, 'week');
    expect(view.counts).toEqual({ active: 0, in_review: 0, paused: 0, stopped: 0, other: 0 });
    expect(view.campaigns).toEqual([]);
    expect(view.spent_month.usd_cents).toBe(0);
  });

  it('EC-ISOLATION : les campagnes et les chiffres d’un autre espace ne sont jamais comptés', async () => {
    const s = await syncWorld();
    s.w.db.rows('campaigns').push({
      id: 'x',
      workspace_id: OTHER_W,
      name: 'Autre',
      status: 'active',
      destination: null,
      updated_at: '2026-10-12',
    });
    s.w.db.rows('stats_daily').push({
      workspace_id: OTHER_W,
      campaign_id: 'x',
      ad_id: null,
      date: '2026-10-11',
      spend_usd_cents: 77777,
      impressions: 1,
      reach: 1,
      clicks: 1,
      results: 1,
      result_type: CONV,
    });
    const view = await getOverview(s.w.ctx, 'month');
    expect(view.spent_month.usd_cents).toBe(0);
    expect(view.campaigns.map((c) => c.name)).not.toContain('Autre');
  });

  it('période inconnue : 400', () => {
    expect(parseOverviewRange(undefined)).toBe('week');
    expect(parseOverviewRange('month')).toBe('month');
    expect(() => parseOverviewRange('annee')).toThrow(AppError);
  });
});

describe('Liste, historique et publicités', () => {
  it('liste : filtre par statut, limite, curseur opaque et fin de liste', async () => {
    const s = await syncWorld();
    for (const [i, name] of ['A', 'B', 'C'].entries()) {
      s.w.db.rows('campaigns').push({
        ...rowOf(s.w.db, s.id),
        id: `0000000${String(i + 1)}-0000-4000-8000-000000000000`,
        name,
        status: 'paused',
        created_at: `2026-10-0${String(i + 1)}T10:00:00Z`,
      });
    }
    rowOf(s.w.db, s.id).created_at = '2026-10-09T10:00:00Z';
    const first = await listCampaigns(s.w.ctx, { limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await listCampaigns(s.w.ctx, { limit: 2, cursor: first.next_cursor ?? '' });
    expect(second.data).toHaveLength(2);
    expect(second.next_cursor).toBeNull();
    const paused = await listCampaigns(s.w.ctx, { status: 'paused' });
    expect(paused.data.map((c) => c.name)).toEqual(['C', 'B', 'A']);
  });

  it('liste : paramètres invalides refusés (400), jamais d’autre espace', async () => {
    const s = await syncWorld();
    await expect(listCampaigns(s.w.ctx, { limit: 0 })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(listCampaigns(s.w.ctx, { limit: 101 })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(listCampaigns(s.w.ctx, { status: 'inconnu' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(listCampaigns(s.w.ctx, { cursor: '%%%' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    const other: MemberCtx = { ...s.w.ctx, workspace: { ...s.w.ctx.workspace, id: OTHER_W } };
    expect((await listCampaigns(other)).data).toEqual([]);
  });

  it('historique : du plus récent au plus ancien, champs en liste blanche seulement, 404 pour un autre espace', async () => {
    const s = await syncWorld();
    s.w.db.rows('campaign_status_events').push(
      {
        id: 1,
        workspace_id: W,
        campaign_id: s.id,
        status: 'in_review',
        source: 'user',
        payload: null,
        created_at: '2026-10-12T09:00:00Z',
      },
      {
        id: 2,
        workspace_id: W,
        campaign_id: s.id,
        status: 'active',
        source: 'poll',
        payload: {
          raw_status: 'ACTIVE',
          event: 'approve',
          from: 'in_review',
          secret: 'NE-DOIT-PAS-SORTIR',
          token: 'x',
        },
        created_at: '2026-10-12T10:00:00Z',
      },
      {
        id: 3,
        workspace_id: OTHER_W,
        campaign_id: 'z',
        status: 'active',
        source: 'poll',
        payload: null,
        created_at: '2026-10-12T11:00:00Z',
      },
    );
    const history = await listCampaignEvents(s.w.ctx, s.id);
    const mine = history.data.filter((e) => e.id === 1 || e.id === 2);
    expect(history.data.map((e) => e.id)).not.toContain(3);
    expect(mine.map((e) => e.id)).toEqual([2, 1]);
    expect(mine[0]?.detail).toEqual({ raw_status: 'ACTIVE', event: 'approve', from: 'in_review' });
    expect(JSON.stringify(history)).not.toContain('NE-DOIT-PAS-SORTIR');
    const other: MemberCtx = { ...s.w.ctx, workspace: { ...s.w.ctx.workspace, id: OTHER_W } };
    await expect(listCampaignEvents(other, s.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('publicités : la pub publiée avec l’adresse signée de sa photo (15 minutes)', async () => {
    const s = await syncWorld();
    const ads = await listCampaignAds(s.w.ctx, s.id);
    expect(ads.data).toHaveLength(1);
    expect(ads.data[0]?.photo_url).toContain('ttl=900');
    expect(ads.ab_test).toBe(false);
    const other: MemberCtx = { ...s.w.ctx, workspace: { ...s.w.ctx.workspace, id: OTHER_W } };
    await expect(listCampaignAds(other, s.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('Tableau de bord : exact au-delà de 100 campagnes et de 1 000 lignes', () => {
  it('les compteurs de statut viennent d’un COUNT en base : 105 campagnes en diffusion = 105, pas 100', async () => {
    const s = await syncWorld();
    const original = rowOf(s.w.db, s.id);
    original.status = 'active';
    for (let i = 0; i < 104; i += 1) {
      s.w.db.rows('campaigns').push({ ...original, id: s.w.db.nextId(), updated_at: '2026-10-11' });
    }
    const view = await getOverview(s.w.ctx, 'week');
    expect(view.counts).toEqual({ active: 105, in_review: 0, paused: 0, stopped: 0, other: 0 });
    expect(view.campaigns).toHaveLength(100);
  });

  it('dépensé du mois exact même au-delà du plafond de lignes de la base (1 240 lignes, plafond 1 000) : lecture par pages', async () => {
    const s = await syncWorld();
    s.w.db.maxRows = 1000;
    for (let c = 0; c < 40; c += 1) {
      for (let d = 1; d <= 31; d += 1) {
        if (d > 12) continue;
        s.w.db.rows('stats_daily').push({
          workspace_id: W,
          campaign_id: `camp-${String(c)}`,
          ad_id: null,
          date: `2026-10-${String(d).padStart(2, '0')}`,
          spend_usd_cents: 100,
          impressions: 1,
          reach: 1,
          clicks: 1,
          results: 1,
          result_type: CONV,
        });
      }
    }
    // 40 campagnes × 12 jours = 480 lignes : on en ajoute pour dépasser 1 000.
    for (let c = 40; c < 90; c += 1) {
      for (let d = 1; d <= 12; d += 1) {
        s.w.db.rows('stats_daily').push({
          workspace_id: W,
          campaign_id: `camp-${String(c)}`,
          ad_id: null,
          date: `2026-10-${String(d).padStart(2, '0')}`,
          spend_usd_cents: 100,
          impressions: 1,
          reach: 1,
          clicks: 1,
          results: 1,
          result_type: CONV,
        });
      }
    }
    expect(s.w.db.rows('stats_daily').length).toBe(1080);
    const view = await getOverview(s.w.ctx, 'month');
    expect(view.spent_month.usd_cents).toBe(108_000);
  });

  it('les lignes plus anciennes que le mois et le graphique ne sont pas lues (tableau = période affichée)', async () => {
    const s = await syncWorld();
    seed(s, [
      { date: '2025-01-15', spend: 777_000, results: 500 },
      { date: '2026-10-11', spend: 3000, results: 22 },
    ]);
    const view = await getOverview(s.w.ctx, 'week');
    expect(view.campaigns[0]).toMatchObject({ results: 22, spend: { usd_cents: 3000 } });
  });
});
