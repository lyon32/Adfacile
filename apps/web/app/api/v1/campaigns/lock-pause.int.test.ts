// S19b — pause automatique des publicités à la fin de la grâce, sur la VRAIE base locale, avec la FAUSSE Meta et la tâche lancée
// `inline` (aucun appel réel). Les 5 cas de `pause-all` et de `resume-all`, la tâche planifiée `campaign.lock-pause` de bout en bout
// (motif `billing_lock` posé par la base, effacé à la reprise par le déclencheur 0022), rejouée sans double effet, et jamais de reprise
// automatique au renouvellement. Leçon de S17 : des défauts invisibles sur PGlite n'apparaissent que sur la vraie base.
import { randomUUID } from 'node:crypto';
import {
  createFullMetaConnector,
  FakeMetaConnector,
  type CampaignControlDeps,
} from '@pubeka/core';
import { campaignLockPauseHandler } from '@pubeka/jobs';
import { getEnv } from '@pubeka/shared';
import {
  describeRoute,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call } from '../meta/int-support';
import { POST as pauseAllRoute } from '../workspaces/[workspaceId]/campaigns/pause-all/route';
import { POST as resumeAllRoute } from '../workspaces/[workspaceId]/campaigns/resume-all/route';
import { ws, json, resetRateLimits } from './int-support';
import { campaignRow, pause, publishedCampaign } from './publish-support';
import { overrideControlDeps, overridePublishDeps } from './services';

const DAY = 24 * 3600 * 1000;
type Who = SeededWorkspace['owner'];

let s: SeededWorkspace;
beforeAll(async () => {
  s = await seedWorkspace();
});
beforeEach(async () => {
  await resetRateLimits();
  overridePublishDeps(undefined);
  overrideControlDeps(undefined);
});
afterAll(() => {
  overrideControlDeps(undefined);
});

const svc = () => testServiceClient();

function fakeMeta(): FakeMetaConnector {
  const connector = createFullMetaConnector(getEnv(), () => new Date());
  if (!(connector instanceof FakeMetaConnector)) {
    throw new Error('PUBEKA_FAKE_PROVIDERS doit contenir « meta » : ce test n’appelle jamais le vrai Meta');
  }
  return connector;
}

/** Abonnement de l'espace : `endsInDays` négatif = échu depuis N jours. `trialing` : essai (verrouillé tout de suite à l'échéance). */
async function subscribe(
  space: SeededWorkspace,
  status: 'trialing' | 'active',
  endsInDays: number,
): Promise<void> {
  const db = svc();
  await db.from('subscriptions').delete().eq('workspace_id', space.workspace.id);
  const end = Date.now() + endsInDays * DAY;
  const r = await db.from('subscriptions').insert({
    workspace_id: space.workspace.id,
    plan_code: 'pro',
    status,
    period_start: new Date(end - 30 * DAY).toISOString(),
    period_end: new Date(end).toISOString(),
  });
  expect(r.error).toBeNull();
}

async function row(campaignId: string) {
  const r = await svc()
    .from('campaigns')
    .select('status, pause_reason, paused_at, meta_campaign_id, workspace_id')
    .eq('id', campaignId)
    .single();
  expect(r.error).toBeNull();
  return r.data;
}

async function metaStatusOf(campaignId: string): Promise<string | undefined> {
  const data = await row(campaignId);
  return fakeMeta().campaigns.get(data?.meta_campaign_id ?? '')?.status;
}

async function events(campaignId: string) {
  const r = await svc()
    .from('campaign_status_events')
    .select('status, source, payload')
    .eq('campaign_id', campaignId)
    .eq('status', 'paused')
    .order('id');
  expect(r.error).toBeNull();
  return r.data ?? [];
}

function pauseAll(
  space: SeededWorkspace,
  who: Who,
  options: { key?: string | null; body?: unknown; workspaceId?: string } = {},
): Promise<Response> {
  const id = options.workspaceId ?? space.workspace.id;
  const key = options.key === undefined ? randomUUID() : options.key;
  return pauseAllRoute(
    call(
      'POST',
      `/workspaces/${id}/campaigns/pause-all`,
      { ...who.headers, ...(key === null ? {} : { 'idempotency-key': key }) },
      options.body ?? {},
    ),
    ws(id),
  );
}

function resumeAll(
  space: SeededWorkspace,
  who: Who,
  options: { key?: string | null; body?: unknown; workspaceId?: string } = {},
): Promise<Response> {
  const id = options.workspaceId ?? space.workspace.id;
  const key = options.key === undefined ? randomUUID() : options.key;
  return resumeAllRoute(
    call(
      'POST',
      `/workspaces/${id}/campaigns/resume-all`,
      { ...who.headers, ...(key === null ? {} : { 'idempotency-key': key }) },
      options.body ?? {},
    ),
    ws(id),
  );
}

interface Bilan {
  paused?: number;
  resumed?: number;
  remaining?: number;
  failed: { campaign_id: string; code: string }[];
  rate_limited: boolean;
}
const bilanOf = async (res: Response): Promise<Bilan> => (await json(res)) as unknown as Bilan;
const codeOf = async (res: Response): Promise<string> => String((await json(res)).code);

/** Un espace neuf avec une campagne publiée (en vérification chez la fausse Meta). */
async function spaceWithCampaign(): Promise<{ space: SeededWorkspace; id: string }> {
  const space = await seedWorkspace();
  const { campaign } = await publishedCampaign(space);
  return { space, id: campaign.id };
}

describeRoute('pauseAllCampaigns', {
  success: async () => {
    const { space, id } = await spaceWithCampaign();
    await subscribe(space, 'active', -5); // grâce écoulée : VERROUILLÉ
    const res = await pauseAll(space, space.owner);
    expect(res.status).toBe(200);
    expect(await bilanOf(res)).toEqual({ paused: 1, failed: [], rate_limited: false });
    expect(await row(id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    expect(await metaStatusOf(id)).toBe('paused');
    expect(await events(id)).toMatchObject([{ status: 'paused', source: 'user' }]);
    // Un éditeur peut aussi.
    const other = await spaceWithCampaign();
    await subscribe(other.space, 'active', -5);
    expect((await pauseAll(other.space, other.space.editor)).status).toBe(200);
  },
  unauthenticated: async () => {
    const { space, id } = await spaceWithCampaign();
    expect((await pauseAll(space, { ...space.owner, headers: {} })).status).toBe(401);
    expect((await campaignRow(id))?.status).toBe('in_review');
  },
  otherWorkspace: async () => {
    const { space, id } = await spaceWithCampaign();
    const stranger = await seedWorkspace();
    const res = await pauseAll(stranger, stranger.owner, { workspaceId: space.workspace.id });
    expect(res.status).toBe(404);
    expect((await campaignRow(id))?.status).toBe('in_review');
  },
  forbiddenRole: async () => {
    const { space, id } = await spaceWithCampaign();
    const res = await pauseAll(space, space.viewer);
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('role_insufficient');
    expect((await campaignRow(id))?.status).toBe('in_review');
  },
  invalidBody: async () => {
    const { space } = await spaceWithCampaign();
    const res = await pauseAll(space, space.owner, { body: { everything: true } });
    expect(res.status).toBe(400);
  },
  extra: {
    'Idempotency-Key absente ou mal formée : 400, rien n’est mis en pause': async () => {
      const { space, id } = await spaceWithCampaign();
      expect((await pauseAll(space, space.owner, { key: null })).status).toBe(400);
      expect((await pauseAll(space, space.owner, { key: 'pas-un-uuid' })).status).toBe(400);
      expect((await campaignRow(id))?.status).toBe('in_review');
    },
    'la même clé rejoue la même réponse sans second ordre à Meta (EC-CAMP-01 pour la pause)': async () => {
      const { space, id } = await spaceWithCampaign();
      const key = randomUUID();
      const before = fakeMeta().pauseAttempts;
      const first = await pauseAll(space, space.owner, { key });
      const again = await pauseAll(space, space.owner, { key });
      expect(first.status).toBe(200);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(await bilanOf(again)).toEqual({ paused: 1, failed: [], rate_limited: false });
      expect(fakeMeta().pauseAttempts - before).toBe(1);
      expect(await events(id)).toHaveLength(1);
    },
    'une nouvelle clé après coup : rien à refaire, aucun double effet': async () => {
      const { space, id } = await spaceWithCampaign();
      await pauseAll(space, space.owner);
      const before = fakeMeta().pauseAttempts;
      const again = await pauseAll(space, space.owner);
      expect(await bilanOf(again)).toMatchObject({ paused: 0, failed: [] });
      expect(fakeMeta().pauseAttempts).toBe(before);
      expect(await events(id)).toHaveLength(1);
    },
    'permise en grâce comme verrouillé (allowLocked), sans motif de verrouillage en grâce': async () => {
      const { space, id } = await spaceWithCampaign();
      await subscribe(space, 'active', -1); // grâce
      expect((await pauseAll(space, space.owner)).status).toBe(200);
      expect(await row(id)).toMatchObject({ status: 'paused', pause_reason: null });
    },
    'aucun autre compte touché : la campagne d’un autre espace reste en vérification chez Meta et dans la base': async () => {
      const mine = await spaceWithCampaign();
      const theirs = await spaceWithCampaign();
      await subscribe(mine.space, 'active', -5);
      await pauseAll(mine.space, mine.space.owner);
      expect((await row(mine.id))?.status).toBe('paused');
      expect((await row(theirs.id))?.status).toBe('in_review');
      expect(await metaStatusOf(theirs.id)).not.toBe('paused');
    },
    'EC-META-07 : Meta ne répond pas → 200 avec la campagne dans « failed », JAMAIS marquée en pause ; le clic suivant réussit': async () => {
      const { space, id } = await spaceWithCampaign();
      await subscribe(space, 'active', -5);
      fakeMeta().simulateTransientError(1);
      const res = await pauseAll(space, space.owner);
      const bilan = await bilanOf(res);
      expect(res.status).toBe(200);
      expect(bilan.paused).toBe(0);
      expect(bilan.failed).toMatchObject([{ campaign_id: id, code: 'meta_error' }]);
      expect(await row(id)).toMatchObject({ status: 'in_review', pause_reason: null });
      expect((await bilanOf(await pauseAll(space, space.owner))).paused).toBe(1);
    },
    'la pause n’est jamais bloquée par PUBEKA_META_PUBLISH désactivé': async () => {
      const { space, id } = await spaceWithCampaign();
      const real = fakeMeta();
      const deps: CampaignControlDeps = {
        connector: real,
        loadToken: () => Promise.resolve({ accessToken: 'jeton-de-test', expiresAt: null }),
        metaPublishEnabled: () => false,
      };
      overrideControlDeps(deps);
      expect((await pauseAll(space, space.owner)).status).toBe(200);
      expect((await row(id))?.status).toBe('paused');
    },
  },
});

describeRoute('resumeAllCampaigns', {
  success: async () => {
    const { space, id } = await spaceWithCampaign();
    await subscribe(space, 'active', -5);
    await pauseAll(space, space.owner);
    await subscribe(space, 'active', 30); // renouvelé
    const res = await resumeAll(space, space.owner);
    expect(res.status).toBe(200);
    expect(await bilanOf(res)).toEqual({ resumed: 1, failed: [], remaining: 0, rate_limited: false });
    // La base a effacé le motif toute seule (déclencheur de la migration 0022) en même temps que le statut.
    expect(await row(id)).toMatchObject({ status: 'active', pause_reason: null, paused_at: null });
    expect(await metaStatusOf(id)).toBe('active');
  },
  unauthenticated: async () => {
    const { space } = await spaceWithCampaign();
    expect((await resumeAll(space, { ...space.owner, headers: {} })).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { space } = await spaceWithCampaign();
    const stranger = await seedWorkspace();
    const res = await resumeAll(stranger, stranger.owner, { workspaceId: space.workspace.id });
    expect(res.status).toBe(404);
  },
  forbiddenRole: async () => {
    const { space } = await spaceWithCampaign();
    const res = await resumeAll(space, space.viewer);
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const { space } = await spaceWithCampaign();
    expect((await resumeAll(space, space.owner, { body: { all: true } })).status).toBe(400);
  },
  extra: {
    'Idempotency-Key absente : 400': async () => {
      const { space } = await spaceWithCampaign();
      expect((await resumeAll(space, space.owner, { key: null })).status).toBe(400);
    },
    'ne reprend QUE les campagnes du verrouillage : celle mise en pause par le client reste en pause': async () => {
      const mine = await spaceWithCampaign();
      const { campaign: second } = await publishedCampaign(mine.space);
      // Le client met lui-même la 2e campagne en pause (route de pause d'une campagne), avant le verrouillage.
      expect((await pause(mine.space, mine.space.owner, second.id)).status).toBe(200);
      await subscribe(mine.space, 'active', -5);
      expect((await bilanOf(await pauseAll(mine.space, mine.space.owner))).paused).toBe(1);
      await subscribe(mine.space, 'active', 30);
      const result = await bilanOf(await resumeAll(mine.space, mine.space.owner));
      expect(result.resumed).toBe(1);
      expect((await row(mine.id))?.status).toBe('active');
      expect(await row(second.id)).toMatchObject({ status: 'paused', pause_reason: null });
      expect(await metaStatusOf(second.id)).toBe('paused');
    },
    'espace encore VERROUILLÉ : la reprise est refusée (403 workspace_locked), rien ne bouge': async () => {
      const { space, id } = await spaceWithCampaign();
      await subscribe(space, 'active', -5);
      await pauseAll(space, space.owner);
      const res = await resumeAll(space, space.owner);
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('workspace_locked');
      expect((await row(id))?.status).toBe('paused');
    },
    'interrupteur PUBEKA_META_PUBLISH désactivé : 503 publish_disabled AVANT tout appel à Meta': async () => {
      const { space, id } = await spaceWithCampaign();
      await subscribe(space, 'active', -5);
      await pauseAll(space, space.owner);
      await subscribe(space, 'active', 30);
      const real = fakeMeta();
      overrideControlDeps({
        connector: real,
        loadToken: () => Promise.resolve({ accessToken: 'jeton-de-test', expiresAt: null }),
        metaPublishEnabled: () => false,
      });
      const before = real.resumeAttempts;
      const res = await resumeAll(space, space.owner);
      expect(res.status).toBe(503);
      expect(((await json(res)).meta as { reason?: string }).reason).toBe('publish_disabled');
      expect(real.resumeAttempts).toBe(before);
      expect(await row(id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    },
    'double clic (deux clés) : une seule reprise chez Meta': async () => {
      const { space } = await spaceWithCampaign();
      await subscribe(space, 'active', -5);
      await pauseAll(space, space.owner);
      await subscribe(space, 'active', 30);
      const real = fakeMeta();
      const before = real.resumeAttempts;
      await resumeAll(space, space.owner);
      const again = await bilanOf(await resumeAll(space, space.owner));
      expect(again.resumed).toBe(0);
      expect(real.resumeAttempts - before).toBe(1);
    },
  },
});

describe('S19b — tâche planifiée campaign.lock-pause, de bout en bout (vraie base, fausse Meta, inline)', () => {
  const run = () =>
    campaignLockPauseHandler.run({}, { now: () => new Date(), runtime: 'inline' });

  it('J+3 : l’espace verrouillé est mis en pause, un autre compte n’est pas touché ; rejouée = aucun double effet', async () => {
    const mine = await spaceWithCampaign();
    const neighbour = await spaceWithCampaign();
    await subscribe(mine.space, 'active', -5);
    await subscribe(neighbour.space, 'active', 20);
    const report = await run();
    expect(report.paused).toBeGreaterThanOrEqual(1);
    expect(await row(mine.id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    expect(await metaStatusOf(mine.id)).toBe('paused');
    expect(await row(neighbour.id)).toMatchObject({ status: 'in_review' });
    expect(await metaStatusOf(neighbour.id)).not.toBe('paused');
    expect(await events(mine.id)).toMatchObject([
      { status: 'paused', source: 'poll', payload: { event: 'pause', reason: 'billing_lock' } },
    ]);
    const attempts = fakeMeta().pauseAttempts;
    await run();
    expect(fakeMeta().pauseAttempts).toBe(attempts);
    expect(await events(mine.id)).toHaveLength(1);
  });

  it('essai terminé sans abonnement : verrouillé tout de suite, les publicités sont mises en pause', async () => {
    const { space, id } = await spaceWithCampaign();
    await subscribe(space, 'trialing', -0.001);
    await run();
    expect(await row(id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
  });

  it('encore en grâce (J+2) : rien n’est mis en pause', async () => {
    const { space, id } = await spaceWithCampaign();
    await subscribe(space, 'active', -2);
    await run();
    expect((await row(id))?.status).toBe('in_review');
  });

  it('un échec chez Meta ne marque rien ; la passe suivante réessaie et réussit', async () => {
    const { space, id } = await spaceWithCampaign();
    await subscribe(space, 'active', -5);
    fakeMeta().simulateTransientError(1);
    const first = await run();
    expect(first.failed.some((f) => f.campaign_id === id)).toBe(true);
    expect(await row(id)).toMatchObject({ status: 'in_review', pause_reason: null });
    await run();
    expect(await row(id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
  });

  it('au renouvellement les publicités RESTENT en pause (la tâche ne reprend jamais) jusqu’au clic « Reprendre mes pubs »', async () => {
    const { space, id } = await spaceWithCampaign();
    await subscribe(space, 'active', -5);
    await run();
    await subscribe(space, 'active', 30);
    const real = fakeMeta();
    const resumes = real.resumeAttempts;
    await run();
    await run();
    expect(real.resumeAttempts).toBe(resumes);
    expect(await row(id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    expect(await metaStatusOf(id)).toBe('paused');
    const bilan = await bilanOf(await resumeAll(space, space.owner));
    expect(bilan.resumed).toBe(1);
    expect(await row(id)).toMatchObject({ status: 'active', pause_reason: null });
  });
});
