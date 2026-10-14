// Routes /workspaces et /workspaces/{id} contre la pile Supabase locale (API_SPEC §15 : les 5 cas).
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { GET as getOne, PATCH as rename } from './[workspaceId]/route';
import { GET as list } from './route';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

function call(
  method: 'GET' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Request {
  return new Request(`${APP}/api/v1${path}`, {
    method,
    headers: { 'x-forwarded-for': `10.${String(Math.floor(Math.random() * 250))}.1.1`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const segment = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describeRoute('listWorkspaces', {
  success: async () => {
    const res = await list(call('GET', '/workspaces', seeded.editor.headers));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown>[] };
    // L'éditeur a son propre espace (inscription) et celui où il a été ajouté.
    expect(data).toHaveLength(2);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: seeded.workspace.id, role: 'editor', plan: 'trial', status: 'active' }),
        expect.objectContaining({ role: 'owner' }),
      ]),
    );
    expect(data.map((w) => w.id)).not.toContain(seeded.strangerWorkspace.id);
  },
  unauthenticated: async () => {
    const res = await list(call('GET', '/workspaces', {}));
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('unauthenticated');
  },
  otherWorkspace: na("liste sans identifiant d'espace : seuls les espaces dont on est membre (vérifié dans « succès »)"),
  forbiddenRole: na('ouvert à tout utilisateur connecté, sans rôle'),
  invalidBody: na('GET sans corps'),
});

describeRoute('getWorkspace', {
  success: async () => {
    const res = await getOne(call('GET', `/workspaces/${seeded.workspace.id}`, seeded.viewer.headers), segment(seeded.workspace.id));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      id: seeded.workspace.id,
      name: seeded.workspace.name,
      status: 'active',
      role: 'viewer',
      plan: 'trial',
      period_end: null,
      grace_until: null,
      quotas: { members: 3, members_limit: 1, pages_limit: 1, campaigns_limit: 2 },
    });
  },
  unauthenticated: async () => {
    const res = await getOne(call('GET', `/workspaces/${seeded.workspace.id}`, {}), segment(seeded.workspace.id));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await getOne(call('GET', `/workspaces/${id}`, seeded.owner.headers), segment(id));
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('not_found');
    const unknown = randomUUID();
    expect((await getOne(call('GET', `/workspaces/${unknown}`, seeded.owner.headers), segment(unknown))).status).toBe(404);
  },
  forbiddenRole: na('tout membre voit l’espace (SECURITY_NOTES §2.2)'),
  invalidBody: async () => {
    // GET sans corps : le seul paramètre est l'identifiant d'espace dans l'adresse.
    const res = await getOne(call('GET', '/workspaces/abc', seeded.owner.headers), segment('abc'));
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([expect.objectContaining({ field: 'workspaceId' })]);
  },
  extra: {
    'formule et dates de l’abonnement le plus récent': async () => {
      const s = await seedWorkspace();
      const svc = testServiceClient();
      const inserted = await svc.from('subscriptions').insert({
        workspace_id: s.workspace.id,
        plan_code: 'business',
        status: 'active',
        period_start: '2026-10-01T00:00:00Z',
        period_end: '2026-11-01T00:00:00Z',
      });
      expect(inserted.error).toBeNull();
      const res = await getOne(call('GET', `/workspaces/${s.workspace.id}`, s.editor.headers), segment(s.workspace.id));
      expect(await json(res)).toMatchObject({
        plan: 'business',
        period_end: '2026-11-01T00:00:00+00:00',
        quotas: { members: 3, members_limit: 5, pages_limit: 10, campaigns_limit: 15 },
      });
    },
  },
});

describeRoute('renameWorkspace', {
  success: async () => {
    const s = await seedWorkspace();
    const res = await rename(call('PATCH', `/workspaces/${s.workspace.id}`, s.owner.headers, { name: '  Boutique Awa ' }), segment(s.workspace.id));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ id: s.workspace.id, name: 'Boutique Awa', role: 'owner' });
    const { data } = await testServiceClient().from('workspaces').select('name').eq('id', s.workspace.id).single();
    expect(data?.name).toBe('Boutique Awa');
  },
  unauthenticated: async () => {
    const res = await rename(call('PATCH', `/workspaces/${seeded.workspace.id}`, { origin: APP }, { name: 'X' }), segment(seeded.workspace.id));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await rename(call('PATCH', `/workspaces/${id}`, seeded.owner.headers, { name: 'Pirate' }), segment(id));
    expect(res.status).toBe(404);
    const { data } = await testServiceClient().from('workspaces').select('name').eq('id', id).single();
    expect(data?.name).not.toBe('Pirate');
  },
  forbiddenRole: async () => {
    const res = await rename(call('PATCH', `/workspaces/${seeded.workspace.id}`, seeded.editor.headers, { name: 'X' }), segment(seeded.workspace.id));
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const res = await rename(
      call('PATCH', `/workspaces/${seeded.workspace.id}`, seeded.owner.headers, { name: ' ', owner_id: randomUUID() }),
      segment(seeded.workspace.id),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', code: 'too_short' }),
        expect.objectContaining({ field: 'owner_id', code: 'unknown_field' }),
      ]),
    );
  },
  extra: {
    '403 workspace_read_only : espace en lecture seule': async () => {
      const s = await seedWorkspace({ status: 'read_only' });
      const res = await rename(call('PATCH', `/workspaces/${s.workspace.id}`, s.owner.headers, { name: 'X' }), segment(s.workspace.id));
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_read_only');
    },
    '400 nom de plus de 120 caractères': async () => {
      const res = await rename(
        call('PATCH', `/workspaces/${seeded.workspace.id}`, seeded.owner.headers, { name: 'a'.repeat(121) }),
        segment(seeded.workspace.id),
      );
      expect(res.status).toBe(400);
    },
  },
});
