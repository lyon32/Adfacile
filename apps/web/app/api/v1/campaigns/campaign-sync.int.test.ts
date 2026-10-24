// Routes de la vie de la campagne (S17) contre la vraie base locale, avec la FAUSSE Meta et un enregistreur de tâches (aucun appel
// réel) : liste, statistiques, « Actualiser » (TR-PLA-06), historique, publicités, tableau de bord. Les 5 cas de chaque route.
// Chiffres et taux D'ESSAI (le produit n'en contient aucun).
import { randomUUID } from 'node:crypto';
import { calendarDateIn } from '@pubeka/shared';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, ws } from '../meta/int-support';
import { GET as overviewRoute } from '../workspaces/[workspaceId]/overview/route';
import { GET as adsRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/ads/route';
import { GET as eventsRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/events/route';
import { GET as listRoute } from '../workspaces/[workspaceId]/campaigns/route';
import { GET as statsRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/stats/route';
import { POST as refreshRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/stats/refresh/route';
import { campaignParams, ensureTestFx, json, resetRateLimits } from './int-support';
import { JobRecorder, publishableCampaign, publishedCampaign } from './publish-support';
import { overridePublishDeps } from './services';

type Who = SeededWorkspace['owner'];
let s: SeededWorkspace;
let jobs: JobRecorder;

beforeAll(async () => {
  s = await seedWorkspace();
  await ensureTestFx('XAF', 600);
});
beforeEach(async () => {
  await resetRateLimits();
  jobs = new JobRecorder();
  overridePublishDeps(jobs.deps());
});
afterAll(() => {
  overridePublishDeps(undefined);
});

const CONVERSATION = 'onsite_conversion.messaging_conversation_started_7d';

async function seedStats(workspaceId: string, campaignId: string): Promise<void> {
  const today = calendarDateIn(new Date(), 'Africa/Douala');
  const yesterday = calendarDateIn(new Date(Date.now() - 86_400_000), 'Africa/Douala');
  const rows = [today, yesterday].map((date) => ({
    workspace_id: workspaceId,
    campaign_id: campaignId,
    ad_id: null,
    date,
    spend_usd_cents: 3000,
    impressions: 1000,
    reach: 800,
    clicks: 30,
    results: 20,
    result_type: CONVERSATION,
  }));
  const inserted = await testServiceClient().from('stats_daily').insert(rows);
  expect(inserted.error).toBeNull();
}

const get = (route: typeof statsRoute, s2: SeededWorkspace, who: Who, tail: string, id: string) =>
  route(
    call('GET', `/workspaces/${s2.workspace.id}/campaigns/${id}/${tail}`, who.headers),
    campaignParams(s2.workspace.id, id),
  );

const stats = (s2: SeededWorkspace, who: Who, id: string, query = '') =>
  statsRoute(
    call('GET', `/workspaces/${s2.workspace.id}/campaigns/${id}/stats${query}`, who.headers),
    campaignParams(s2.workspace.id, id),
  );
const refresh = (s2: SeededWorkspace, who: Who, id: string) =>
  refreshRoute(
    call('POST', `/workspaces/${s2.workspace.id}/campaigns/${id}/stats/refresh`, who.headers),
    campaignParams(s2.workspace.id, id),
  );
const overview = (s2: SeededWorkspace, who: Who, query = '') =>
  overviewRoute(
    call('GET', `/workspaces/${s2.workspace.id}/overview${query}`, who.headers),
    ws(s2.workspace.id),
  );
const list = (s2: SeededWorkspace, who: Who, query = '') =>
  listRoute(
    call('GET', `/workspaces/${s2.workspace.id}/campaigns${query}`, who.headers),
    ws(s2.workspace.id),
  );

interface Problem {
  code: string;
  status: number;
}
const problemOf = async (res: Response): Promise<Problem> =>
  (await json(res)) as unknown as Problem;

describeRoute('listCampaigns', {
  success: async () => {
    const { campaign } = await publishableCampaign(s);
    const res = await list(s, s.owner);
    expect(res.status).toBe(200);
    const body = (await json(res)) as { data: { id: string }[]; next_cursor: string | null };
    expect(body.data.map((c) => c.id)).toContain(campaign.id);
    // Un lecteur voit la liste aussi.
    expect((await list(s, s.viewer, '?limit=1')).status).toBe(200);
  },
  unauthenticated: async () => {
    expect((await list(s, { ...s.owner, headers: {} })).status).toBe(401);
  },
  otherWorkspace: async () => {
    const stranger = await seedWorkspace();
    const body = (await json(await list(stranger, stranger.owner))) as { data: unknown[] };
    expect(body.data).toEqual([]);
    // Utiliser l'espace d'un autre avec sa propre session : 404 (jamais 403).
    const res = await listRoute(
      call('GET', `/workspaces/${s.workspace.id}/campaigns`, stranger.owner.headers),
      ws(s.workspace.id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer »'),
  invalidBody: async () => {
    expect((await list(s, s.owner, '?limit=0')).status).toBe(400);
    expect((await list(s, s.owner, '?limit=101')).status).toBe(400);
    expect((await list(s, s.owner, '?status=inconnu')).status).toBe(400);
    expect((await list(s, s.owner, '?cursor=%25%25')).status).toBe(400);
    expect((await list(s, s.owner, '?inconnu=1')).status).toBe(400);
  },
  extra: {
    'curseur signé : deux campagnes créées au même instant ne sont pas sautées d’une page à l’autre':
      async () => {
        const mine = await seedWorkspace();
        const at = '2026-10-05T10:00:00.000Z';
        const inserted = await testServiceClient()
          .from('campaigns')
          .insert(
            [1, 2, 3].map((n) => ({
              workspace_id: mine.workspace.id,
              name: `Même instant ${String(n)}`,
              created_at: at,
            })),
          )
          .select('id');
        expect(inserted.error).toBeNull();
        const wanted = (inserted.data ?? []).map((row) => row.id).sort();
        const seen: string[] = [];
        let cursor = '';
        for (let page = 0; page < 5; page += 1) {
          const res = await list(mine, mine.owner, `?limit=1${cursor}`);
          expect(res.status).toBe(200);
          const body = (await json(res)) as { data: { id: string }[]; next_cursor: string | null };
          seen.push(...body.data.map((c) => c.id));
          if (body.next_cursor === null) break;
          cursor = `&cursor=${encodeURIComponent(body.next_cursor)}`;
        }
        expect([...seen].sort()).toEqual(wanted);
      },
    'curseur falsifié : 400 problem+json validation_failed sur « cursor », aucune ligne renvoyée':
      async () => {
        const forged = Buffer.from(
          JSON.stringify({ created_at: '2020-01-01T00:00:00.000Z', id: randomUUID() }),
        ).toString('base64url');
        for (const cursor of [forged, `${forged}.AAAA`, 'a.b.c']) {
          const res = await list(s, s.owner, `?cursor=${encodeURIComponent(cursor)}`);
          expect(res.status).toBe(400);
          expect(res.headers.get('content-type')).toContain('application/problem+json');
          const problem = (await json(res)) as { code: string; errors?: { field: string }[] };
          expect(problem.code).toBe('validation_failed');
          expect(problem.errors?.[0]?.field).toBe('cursor');
        }
      },
  },
});

describeRoute('getCampaignStats', {
  success: async () => {
    const { campaign } = await publishedCampaign(s);
    await seedStats(s.workspace.id, campaign.id);
    const res = await stats(s, s.viewer, campaign.id);
    expect(res.status).toBe(200);
    const body = (await json(res)) as {
      summary: {
        spend: { usd_cents: number; local_minor: number | null; currency: string | null };
        results: number;
        result_kind: string | null;
        cost_per_result: { usd_cents: number } | null;
      };
      fx: { status: string; source: string | null };
      daily: unknown[];
    };
    expect(body.summary).toMatchObject({
      results: 40,
      result_kind: 'whatsapp_conversation',
      // 2 jours × 30 $ = 60 $ ; taux d'essai 600 → 36 000 FCFA ; coût par résultat : 60 $ ÷ 40 = 1,50 $.
      spend: { usd_cents: 6000, local_minor: 36_000, currency: 'XAF' },
      cost_per_result: { usd_cents: 150 },
    });
    expect(body.fx.status).toBe('ok');
    expect(body.daily).toHaveLength(2);
    // Le taux lui-même ne sort jamais.
    expect(JSON.stringify(body)).not.toContain('"rate"');
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await stats(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishableCampaign(s);
    const stranger = await seedWorkspace();
    expect((await stats(stranger, stranger.owner, campaign.id)).status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer »'),
  invalidBody: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await stats(s, s.owner, 'pas-un-uuid')).status).toBe(400);
    expect((await stats(s, s.owner, campaign.id, '?from=hier')).status).toBe(400);
    expect((await stats(s, s.owner, campaign.id, '?from=2026-10-12&to=2026-10-01')).status).toBe(
      400,
    );
    expect((await stats(s, s.owner, campaign.id, '?from=2020-01-01&to=2026-10-01')).status).toBe(
      400,
    );
    expect((await stats(s, s.owner, campaign.id, '?champ=1')).status).toBe(400);
    expect((await stats(s, s.owner, randomUUID())).status).toBe(404);
  },
});

describeRoute('refreshCampaignStats', {
  success: async () => {
    const { campaign } = await publishedCampaign(s);
    const res = await refresh(s, s.viewer, campaign.id);
    expect(res.status).toBe(202);
    expect(await json(res)).toMatchObject({ status: 'queued' });
    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0]).toMatchObject({
      taskId: 'campaign.sync-stats',
      payload: { campaignId: campaign.id, workspaceId: s.workspace.id },
    });
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await refresh(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
    expect(jobs.jobs).toHaveLength(0);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishedCampaign(s);
    const stranger = await seedWorkspace();
    expect((await refresh(stranger, stranger.owner, campaign.id)).status).toBe(404);
    expect(jobs.jobs).toHaveLength(0);
  },
  forbiddenRole: na(
    'lecture seule chez Meta, aucune dépense : tout membre peut actualiser (limite de 5 minutes par campagne)',
  ),
  invalidBody: na('POST sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; inconnu : 404': async () => {
      expect((await refresh(s, s.owner, 'pas-un-uuid')).status).toBe(400);
      expect((await refresh(s, s.owner, randomUUID())).status).toBe(404);
    },
    'TR-PLA-06 : une 2e demande dans les 5 minutes → 429 rate_limited avec Retry-After, une seule tâche lancée':
      async () => {
        const { campaign } = await publishedCampaign(s);
        expect((await refresh(s, s.owner, campaign.id)).status).toBe(202);
        const again = await refresh(s, s.editor, campaign.id);
        expect(again.status).toBe(429);
        expect((await problemOf(again)).code).toBe('rate_limited');
        expect(Number(again.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(jobs.jobs).toHaveLength(1);
      },
    'deux clics simultanés : une seule demande passe': async () => {
      const { campaign } = await publishedCampaign(s);
      const results = await Promise.all([
        refresh(s, s.owner, campaign.id),
        refresh(s, s.owner, campaign.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([202, 429]);
      expect(jobs.jobs).toHaveLength(1);
    },
    'campagne jamais publiée chez Meta : 409, aucune tâche': async () => {
      const { campaign } = await publishableCampaign(s);
      const res = await refresh(s, s.owner, campaign.id);
      expect(res.status).toBe(409);
      expect(jobs.jobs).toHaveLength(0);
    },
    'le lancement échoue : 503 et la fenêtre est rendue (réessai immédiat possible)': async () => {
      const { campaign } = await publishedCampaign(s);
      const failing = new JobRecorder();
      const deps = failing.deps();
      overridePublishDeps({
        ...deps,
        jobs: { enqueue: () => Promise.reject(new Error('file indisponible')) },
      });
      expect((await refresh(s, s.owner, campaign.id)).status).toBe(503);
      overridePublishDeps(jobs.deps());
      expect((await refresh(s, s.owner, campaign.id)).status).toBe(202);
    },
  },
});

describeRoute('listCampaignEvents', {
  success: async () => {
    const { campaign } = await publishedCampaign(s);
    const res = await get(eventsRoute, s, s.viewer, 'events', campaign.id);
    expect(res.status).toBe(200);
    const body = (await json(res)) as { data: { status: string; source: string }[] };
    expect(body.data.map((e) => e.status)).toContain('in_review');
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s);
    expect(
      (await get(eventsRoute, s, { ...s.owner, headers: {} }, 'events', campaign.id)).status,
    ).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishableCampaign(s);
    const stranger = await seedWorkspace();
    expect((await get(eventsRoute, stranger, stranger.owner, 'events', campaign.id)).status).toBe(
      404,
    );
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer »'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; inconnu : 404': async () => {
      expect((await get(eventsRoute, s, s.owner, 'events', 'pas-un-uuid')).status).toBe(400);
      expect((await get(eventsRoute, s, s.owner, 'events', randomUUID())).status).toBe(404);
    },
  },
});

describeRoute('listCampaignAds', {
  success: async () => {
    const { campaign } = await publishedCampaign(s);
    const res = await get(adsRoute, s, s.viewer, 'ads', campaign.id);
    expect(res.status).toBe(200);
    const body = (await json(res)) as { data: { photo_url: string | null }[]; ab_test: boolean };
    expect(body.data).toHaveLength(1);
    expect(body.ab_test).toBe(false);
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await get(adsRoute, s, { ...s.owner, headers: {} }, 'ads', campaign.id)).status).toBe(
      401,
    );
  },
  otherWorkspace: async () => {
    const { campaign } = await publishableCampaign(s);
    const stranger = await seedWorkspace();
    expect((await get(adsRoute, stranger, stranger.owner, 'ads', campaign.id)).status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer »'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; inconnu : 404': async () => {
      expect((await get(adsRoute, s, s.owner, 'ads', 'pas-un-uuid')).status).toBe(400);
      expect((await get(adsRoute, s, s.owner, 'ads', randomUUID())).status).toBe(404);
    },
  },
});

describeRoute('getWorkspaceOverview', {
  success: async () => {
    const mine = await seedWorkspace();
    const { campaign } = await publishedCampaign(mine);
    await seedStats(mine.workspace.id, campaign.id);
    const res = await overview(mine, mine.viewer, '?range=month');
    expect(res.status).toBe(200);
    const body = (await json(res)) as {
      counts: { in_review: number };
      spent_month: { usd_cents: number };
      campaigns: { id: string; results: number }[];
      chart: { date: string }[];
      range: string;
    };
    expect(body.range).toBe('month');
    expect(body.counts.in_review).toBe(1);
    expect(body.campaigns.find((c) => c.id === campaign.id)?.results).toBeGreaterThan(0);
    expect(body.chart.length).toBeGreaterThan(0);
    expect(body.spent_month.usd_cents).toBeGreaterThan(0);
  },
  unauthenticated: async () => {
    expect((await overview(s, { ...s.owner, headers: {} })).status).toBe(401);
  },
  otherWorkspace: async () => {
    const stranger = await seedWorkspace();
    const res = await overviewRoute(
      call('GET', `/workspaces/${s.workspace.id}/overview`, stranger.owner.headers),
      ws(s.workspace.id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer »'),
  invalidBody: async () => {
    expect((await overview(s, s.owner, '?range=annee')).status).toBe(400);
    expect((await overview(s, s.owner, '?autre=1')).status).toBe(400);
  },
  extra: {
    'un espace vide : compteurs à zéro, aucun tableau': async () => {
      const empty = await seedWorkspace();
      const body = (await json(await overview(empty, empty.owner))) as {
        counts: { active: number };
        campaigns: unknown[];
      };
      expect(body.counts.active).toBe(0);
      expect(body.campaigns).toEqual([]);
    },
  },
});

describe('isolation', () => {
  it('le tableau de bord ne compte JAMAIS les chiffres d’un autre espace', async () => {
    const a = await seedWorkspace();
    const b = await seedWorkspace();
    const { campaign } = await publishedCampaign(b);
    await seedStats(b.workspace.id, campaign.id);
    const body = (await json(await overview(a, a.owner, '?range=month'))) as {
      spent_month: { usd_cents: number };
      campaigns: unknown[];
    };
    expect(body.spent_month.usd_cents).toBe(0);
    expect(body.campaigns).toEqual([]);
  });
});
