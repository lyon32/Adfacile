// S19 / TR-PAY-07 contre la vraie base locale : l'accès d'un espace suit son ABONNEMENT (grâce de 3 jours, puis lecture seule ;
// essai terminé = lecture seule tout de suite) ou la décision de l'administration (suspension), évalué à chaque requête.
// La mise en pause reste permise dans tous les cas ; les autres écritures renvoient 403 (Problem Details). Fausse Meta : aucun appel réel.
import { randomUUID } from 'node:crypto';
import { seedWorkspace, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call } from '../meta/int-support';
import { GET as listMembers } from '../workspaces/[workspaceId]/members/route';
import { GET as getWorkspace, PATCH as renameWorkspace } from '../workspaces/[workspaceId]/route';
import { resetRateLimits } from './int-support';
import { campaignRow, json, pause, publishedCampaign, resume } from './publish-support';
import { overrideControlDeps, overridePublishDeps } from './services';

const DAY = 24 * 3600 * 1000;
const svc = () => testServiceClient();

let s: SeededWorkspace;
let campaignId = '';

beforeAll(async () => {
  s = await seedWorkspace();
  campaignId = (await publishedCampaign(s)).campaign.id;
});
beforeEach(async () => {
  await resetRateLimits();
  overridePublishDeps(undefined);
  overrideControlDeps(undefined);
});
afterAll(() => {
  overrideControlDeps(undefined);
});

type SubStatus = 'trialing' | 'active' | 'grace' | 'read_only' | 'canceled';

/** Remplace l'abonnement de l'espace : `endsInDays` négatif = déjà échu. */
async function subscribe(status: SubStatus, endsInDays: number): Promise<number> {
  const end = Date.now() + endsInDays * DAY;
  const removed = await svc().from('subscriptions').delete().eq('workspace_id', s.workspace.id);
  expect(removed.error).toBeNull();
  const inserted = await svc()
    .from('subscriptions')
    .insert({
      workspace_id: s.workspace.id,
      plan_code: 'pro',
      status,
      period_start: new Date(end - 30 * DAY).toISOString(),
      period_end: new Date(end).toISOString(),
    });
  expect(inserted.error).toBeNull();
  return end;
}

async function setStored(status: 'active' | 'read_only' | 'suspended'): Promise<void> {
  const r = await svc().from('workspaces').update({ status }).eq('id', s.workspace.id);
  expect(r.error).toBeNull();
}

const wsParams = () => ({ params: Promise.resolve({ workspaceId: s.workspace.id }) });
const rename = (who: SeededWorkspace['owner'], name: string) =>
  renameWorkspace(
    call('PATCH', `/workspaces/${s.workspace.id}`, who.headers, { name }),
    wsParams(),
  );
const view = async () => {
  const res = await getWorkspace(
    call('GET', `/workspaces/${s.workspace.id}`, s.viewer.headers),
    wsParams(),
  );
  expect(res.status).toBe(200);
  return (await json(res)) as {
    status: string;
    grace_until: string | null;
    status_cause: string | null;
  };
};
const code = async (res: Response) => ((await json(res)) as { code: string }).code;

describe('TR-PAY-07 : l’état de l’espace suit l’abonnement (décision du 26/10/2026)', () => {
  beforeEach(async () => {
    await setStored('active');
  });

  const members = (who: SeededWorkspace['owner']) =>
    listMembers(call('GET', `/workspaces/${s.workspace.id}/members`, who.headers), wsParams());

  it('abonnement en cours : écriture et lecture permises, statut « active »', async () => {
    await subscribe('active', 10);
    expect((await rename(s.owner, 'Boutique A')).status).toBe(200);
    expect((await members(s.owner)).status).toBe(200);
    expect((await view()).status).toBe('active');
  });

  it('J+1 (grâce de 3 jours) : lecture et pause permises, écriture REFUSÉE (workspace_read_only), fin de grâce annoncée (J+3)', async () => {
    const end = await subscribe('active', -1);
    const denied = await rename(s.owner, 'Interdit en grâce');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('content-type')).toContain('application/problem+json');
    expect(await code(denied)).toBe('workspace_read_only');
    expect((await members(s.owner)).status).toBe(200);
    const v = await view();
    expect(v.status).toBe('grace');
    expect(new Date(v.grace_until ?? '').getTime()).toBeCloseTo(end + 3 * DAY, -3);
    expect(v.status_cause).toBe('grace');
  });

  it('J+4 (grâce écoulée) : VERROUILLÉ — écriture et lecture refusées (workspace_locked), état de l’espace lisible, pause ACCEPTÉE, reprise refusée', async () => {
    await subscribe('active', -4);
    const denied = await rename(s.owner, 'Interdit');
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe('workspace_locked');
    const read = await members(s.owner);
    expect(read.status).toBe(403);
    expect(await code(read)).toBe('workspace_locked');
    const v = await view();
    expect(v.status).toBe('locked');
    expect(v.status_cause).toBe('subscription_ended');

    const paused = await pause(s, s.owner, campaignId);
    expect(paused.status).toBe(200);
    expect((await campaignRow(campaignId))?.status).toBe('paused');

    const resumed = await resume(s, s.owner, campaignId);
    expect(resumed.status).toBe(403);
    expect(await code(resumed)).toBe('workspace_locked');
    expect((await campaignRow(campaignId))?.status).toBe('paused');
  });

  it('frontière J+3 : une minute avant la fin des 72 h c’est la grâce, une minute après c’est verrouillé', async () => {
    await subscribe('active', -3 + 1 / 1440);
    expect((await view()).status).toBe('grace');
    await subscribe('active', -3 - 1 / 1440);
    expect((await view()).status).toBe('locked');
  });

  it('la pause part chez Meta dans TOUS les états (grâce, essai terminé, verrouillé, suspension)', async () => {
    const cases: [string, () => Promise<void>][] = [
      ['grâce', () => subscribe('active', -1).then(() => undefined)],
      ['essai terminé', () => subscribe('trialing', -0.01).then(() => undefined)],
      ['verrouillé', () => subscribe('active', -5).then(() => undefined)],
      [
        'suspension',
        async () => {
          await subscribe('active', 20);
          await setStored('suspended');
        },
      ],
    ];
    for (const [label, arrange] of cases) {
      await setStored('active');
      await subscribe('active', 10);
      const { campaign } = await publishedCampaign(s);
      await arrange();
      const res = await pause(s, s.owner, campaign.id);
      expect(res.status, label).toBe(200);
      expect((await campaignRow(campaign.id))?.status, label).toBe('paused');
    }
  });

  it('même accès pour l’éditeur ; le lecteur garde son 403 de rôle', async () => {
    await subscribe('active', -5);
    expect((await pause(s, s.editor, campaignId)).status).toBe(200);
    const viewer = await pause(s, s.viewer, campaignId);
    expect(viewer.status).toBe(403);
    expect(await code(viewer)).toBe('role_insufficient');
  });

  it('renouvellement : une nouvelle période rend tout immédiatement', async () => {
    await subscribe('active', -5);
    expect((await rename(s.owner, 'Encore interdit')).status).toBe(403);
    await subscribe('active', 30);
    expect((await rename(s.owner, 'Boutique C')).status).toBe(200);
    expect((await members(s.owner)).status).toBe(200);
    expect((await view()).status).toBe('active');
  });

  it('essai terminé sans abonnement payé : VERROUILLÉ tout de suite, sans grâce, cause « trial_ended »', async () => {
    await subscribe('trialing', -0.01);
    const denied = await rename(s.owner, 'Interdit');
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe('workspace_locked');
    const v = await view();
    expect(v.status).toBe('locked');
    expect(v.status_cause).toBe('trial_ended');
    await subscribe('trialing', 3);
    expect((await rename(s.owner, 'Essai en cours')).status).toBe(200);
  });

  it('annulation : la fin de période est le seul moment qui compte (grâce de 3 jours, puis verrouillé)', async () => {
    await subscribe('canceled', -1);
    expect((await view()).status).toBe('grace');
    await subscribe('canceled', -4);
    expect((await view()).status).toBe('locked');
  });

  it('lecture seule décidée par l’administration : écriture refusée (workspace_read_only), lecture permise, cause « admin »', async () => {
    await subscribe('active', 20);
    await setStored('read_only');
    expect(await code(await rename(s.owner, 'Interdit'))).toBe('workspace_read_only');
    expect((await members(s.owner)).status).toBe(200);
    const v = await view();
    expect(v.status).toBe('read_only');
    expect(v.status_cause).toBe('admin');
  });

  it('suspension : écriture refusée (workspace_suspended), lecture et pause permises, même avec un abonnement en cours', async () => {
    await subscribe('active', 20);
    await setStored('suspended');
    const denied = await rename(s.owner, 'Interdit');
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe('workspace_suspended');
    expect((await members(s.owner)).status).toBe(200);
    expect((await view()).status).toBe('suspended');
    expect((await pause(s, s.owner, campaignId)).status).toBe(200);
  });

  it('sans abonnement (l’essai démarre en S24) : l’espace reste actif avec les limites Starter, aucune cause', async () => {
    const removed = await svc().from('subscriptions').delete().eq('workspace_id', s.workspace.id);
    expect(removed.error).toBeNull();
    expect((await rename(s.owner, 'Boutique D')).status).toBe(200);
    const v = await view();
    expect(v.status).toBe('active');
    expect(v.status_cause).toBeNull();
  });

  it('autre espace : 404, jamais 403 ni workspace_locked (l’état d’un espace ne fuit pas)', async () => {
    await subscribe('active', -5);
    const res = await renameWorkspace(
      call('PATCH', `/workspaces/${s.workspace.id}`, s.stranger.headers, { name: randomUUID() }),
      wsParams(),
    );
    expect(res.status).toBe(404);
    expect((await members(s.stranger)).status).toBe(404);
  });
});
