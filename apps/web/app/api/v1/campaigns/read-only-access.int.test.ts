// S19 / TR-PAY-07 contre la vraie base locale : l'accès d'un espace suit son ABONNEMENT (grâce de 3 jours, puis lecture seule ;
// essai terminé = lecture seule tout de suite) ou la décision de l'administration (suspension), évalué à chaque requête.
// La mise en pause reste permise dans tous les cas ; les autres écritures renvoient 403 (Problem Details). Fausse Meta : aucun appel réel.
import { randomUUID } from 'node:crypto';
import { seedWorkspace, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call } from '../meta/int-support';
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
  return (await json(res)) as { status: string; grace_until: string | null };
};
const code = async (res: Response) => ((await json(res)) as { code: string }).code;

describe('TR-PAY-07 : l’état de l’espace suit l’abonnement', () => {
  beforeEach(async () => {
    await setStored('active');
  });

  it('abonnement en cours : écriture permise, statut « active »', async () => {
    await subscribe('active', 10);
    expect((await rename(s.owner, 'Boutique A')).status).toBe(200);
    expect((await view()).status).toBe('active');
  });

  it('J+1 après l’échéance : grâce, tout fonctionne, la fin de grâce est annoncée (J+3)', async () => {
    const end = await subscribe('active', -1);
    expect((await rename(s.owner, 'Boutique B')).status).toBe(200);
    const v = await view();
    expect(v.status).toBe('grace');
    expect(new Date(v.grace_until ?? '').getTime()).toBeCloseTo(end + 3 * DAY, -3);
  });

  it('J+5 : lecture seule — écriture refusée 403 workspace_read_only, pause ACCEPTÉE, reprise refusée', async () => {
    await subscribe('active', -5);
    const denied = await rename(s.owner, 'Interdit');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('content-type')).toContain('application/problem+json');
    expect(await code(denied)).toBe('workspace_read_only');
    expect((await view()).status).toBe('read_only');

    const paused = await pause(s, s.owner, campaignId);
    expect(paused.status).toBe(200);
    expect((await campaignRow(campaignId))?.status).toBe('paused');

    const resumed = await resume(s, s.owner, campaignId);
    expect(resumed.status).toBe(403);
    expect(await code(resumed)).toBe('workspace_read_only');
    expect((await campaignRow(campaignId))?.status).toBe('paused');
  });

  it('même refus pour l’éditeur ; le lecteur garde son 403 de rôle', async () => {
    await subscribe('active', -5);
    expect((await pause(s, s.editor, campaignId)).status).toBe(200);
    const viewer = await pause(s, s.viewer, campaignId);
    expect(viewer.status).toBe(403);
    expect(await code(viewer)).toBe('role_insufficient');
  });

  it('renouvellement : une nouvelle période rend l’écriture immédiatement', async () => {
    await subscribe('active', -5);
    expect((await rename(s.owner, 'Encore interdit')).status).toBe(403);
    await subscribe('active', 30);
    expect((await rename(s.owner, 'Boutique C')).status).toBe(200);
    expect((await view()).status).toBe('active');
  });

  it('essai terminé : lecture seule tout de suite, sans grâce (décision 5 du 10/10/2026)', async () => {
    await subscribe('trialing', -0.01);
    const denied = await rename(s.owner, 'Interdit');
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe('workspace_read_only');
    expect((await view()).status).toBe('read_only');
  });

  it('suspension par l’administration : écriture 403 workspace_suspended, pause permise, même avec un abonnement en cours', async () => {
    await subscribe('active', 20);
    await setStored('suspended');
    const denied = await rename(s.owner, 'Interdit');
    expect(denied.status).toBe(403);
    expect(await code(denied)).toBe('workspace_suspended');
    expect((await view()).status).toBe('suspended');
    expect((await pause(s, s.owner, campaignId)).status).toBe(200);
  });

  it('sans abonnement (l’essai démarre en S24) : l’espace reste actif', async () => {
    const removed = await svc().from('subscriptions').delete().eq('workspace_id', s.workspace.id);
    expect(removed.error).toBeNull();
    expect((await rename(s.owner, 'Boutique D')).status).toBe(200);
    expect((await view()).status).toBe('active');
  });

  it('autre espace : 404, jamais 403 (l’état d’un espace ne fuit pas)', async () => {
    const res = await renameWorkspace(
      call('PATCH', `/workspaces/${s.workspace.id}`, s.stranger.headers, { name: randomUUID() }),
      wsParams(),
    );
    expect(res.status).toBe(404);
  });
});
