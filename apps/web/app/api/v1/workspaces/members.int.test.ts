// Membres et transfert de propriété contre la pile Supabase locale (API_SPEC §15 : les 5 cas ;
// SECURITY_NOTES EC-TEAM-04, EC-TEAM-05, EC-TEAM-06).
import { randomUUID } from 'node:crypto';
import { describeRoute, na, seedWorkspace, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { DELETE as remove, PATCH as changeRole } from './[workspaceId]/members/[profileId]/route';
import { GET as listMembers } from './[workspaceId]/members/route';
import { GET as getWorkspace } from './[workspaceId]/route';
import { POST as transfer } from './[workspaceId]/transfer-ownership/route';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Request {
  return new Request(`${APP}/api/v1${path}`, {
    method,
    headers: { 'x-forwarded-for': `10.${String(Math.floor(Math.random() * 250))}.2.1`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ws = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });
const member = (workspaceId: string, profileId: string) => ({
  params: Promise.resolve({ workspaceId, profileId }),
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function roleOf(workspaceId: string, profileId: string): Promise<string | undefined> {
  const { data } = await testServiceClient()
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileId)
    .maybeSingle();
  return data?.role;
}

describeRoute('listMembers', {
  success: async () => {
    const id = seeded.workspace.id;
    const res = await listMembers(call('GET', `/workspaces/${id}/members`, seeded.viewer.headers), ws(id));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown>[] };
    const rows = data.map((m) => [m.profile_id, m.role, m.email]);
    // Le propriétaire d'abord ; l'éditeur et le lecteur sont arrivés au même instant (seed).
    expect(rows[0]).toEqual([seeded.owner.id, 'owner', seeded.owner.email]);
    expect(rows.slice(1)).toEqual(
      expect.arrayContaining([
        [seeded.editor.id, 'editor', seeded.editor.email],
        [seeded.viewer.id, 'viewer', seeded.viewer.email],
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(data[0]?.joined_at).toEqual(expect.any(String));
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    expect((await listMembers(call('GET', `/workspaces/${id}/members`, {}), ws(id))).status).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await listMembers(call('GET', `/workspaces/${id}/members`, seeded.owner.headers), ws(id));
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('tout membre voit les membres (SECURITY_NOTES §2.2)'),
  invalidBody: na('GET sans corps'),
});

describeRoute('changeMemberRole', {
  success: async () => {
    const s = await seedWorkspace();
    const id = s.workspace.id;
    const res = await changeRole(
      call('PATCH', `/workspaces/${id}/members/${s.editor.id}`, s.owner.headers, { role: 'viewer' }),
      member(id, s.editor.id),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ profile_id: s.editor.id, role: 'viewer', email: s.editor.email });
    expect(await roleOf(id, s.editor.id)).toBe('viewer');
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await changeRole(
      call('PATCH', `/workspaces/${id}/members/${seeded.viewer.id}`, { origin: APP }, { role: 'editor' }),
      member(id, seeded.viewer.id),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    // Espace d'un autre : 404, et le rôle du membre de cet espace n'a pas bougé.
    const id = seeded.strangerWorkspace.id;
    const res = await changeRole(
      call('PATCH', `/workspaces/${id}/members/${seeded.stranger.id}`, seeded.owner.headers, { role: 'viewer' }),
      member(id, seeded.stranger.id),
    );
    expect(res.status).toBe(404);
    expect(await roleOf(id, seeded.stranger.id)).toBe('owner');
  },
  forbiddenRole: async () => {
    const id = seeded.workspace.id;
    const res = await changeRole(
      call('PATCH', `/workspaces/${id}/members/${seeded.viewer.id}`, seeded.editor.headers, { role: 'editor' }),
      member(id, seeded.viewer.id),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
    expect(await roleOf(id, seeded.viewer.id)).toBe('viewer');
  },
  invalidBody: async () => {
    const id = seeded.workspace.id;
    const res = await changeRole(
      call('PATCH', `/workspaces/${id}/members/${seeded.viewer.id}`, seeded.owner.headers, { role: 'owner' }),
      member(id, seeded.viewer.id),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([expect.objectContaining({ field: 'role', code: 'invalid_value' })]);
  },
  extra: {
    'EC-TEAM-05 : 409 quand le propriétaire change son propre rôle': async () => {
      const id = seeded.workspace.id;
      const res = await changeRole(
        call('PATCH', `/workspaces/${id}/members/${seeded.owner.id}`, seeded.owner.headers, { role: 'editor' }),
        member(id, seeded.owner.id),
      );
      expect(res.status).toBe(409);
      expect(await roleOf(id, seeded.owner.id)).toBe('owner');
    },
    '404 : personne qui n’est pas membre de cet espace': async () => {
      const id = seeded.workspace.id;
      const res = await changeRole(
        call('PATCH', `/workspaces/${id}/members/${seeded.stranger.id}`, seeded.owner.headers, { role: 'viewer' }),
        member(id, seeded.stranger.id),
      );
      expect(res.status).toBe(404);
    },
    '400 : identifiant de membre mal formé': async () => {
      const id = seeded.workspace.id;
      const res = await changeRole(
        call('PATCH', `/workspaces/${id}/members/abc`, seeded.owner.headers, { role: 'viewer' }),
        member(id, 'abc'),
      );
      expect(res.status).toBe(400);
      expect((await json(res)).errors).toEqual([expect.objectContaining({ field: 'profileId' })]);
    },
  },
});

describeRoute('removeMember', {
  success: async () => {
    // EC-TEAM-04 : le membre retiré reçoit 404 dès sa requête suivante sur l'espace.
    const s = await seedWorkspace();
    const id = s.workspace.id;
    const before = await getWorkspace(call('GET', `/workspaces/${id}`, s.viewer.headers), ws(id));
    expect(before.status).toBe(200);
    const res = await remove(call('DELETE', `/workspaces/${id}/members/${s.viewer.id}`, s.owner.headers), member(id, s.viewer.id));
    expect(res.status).toBe(204);
    expect(await roleOf(id, s.viewer.id)).toBeUndefined();
    const after = await getWorkspace(call('GET', `/workspaces/${id}`, s.viewer.headers), ws(id));
    expect(after.status).toBe(404);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await remove(call('DELETE', `/workspaces/${id}/members/${seeded.viewer.id}`, { origin: APP }), member(id, seeded.viewer.id));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const s = await seedWorkspace();
    const id = s.strangerWorkspace.id;
    const res = await remove(call('DELETE', `/workspaces/${id}/members/${s.stranger.id}`, s.owner.headers), member(id, s.stranger.id));
    expect(res.status).toBe(404);
    expect(await roleOf(id, s.stranger.id)).toBe('owner');
  },
  forbiddenRole: async () => {
    const id = seeded.workspace.id;
    const res = await remove(call('DELETE', `/workspaces/${id}/members/${seeded.viewer.id}`, seeded.editor.headers), member(id, seeded.viewer.id));
    expect(res.status).toBe(403);
    expect(await roleOf(id, seeded.viewer.id)).toBe('viewer');
  },
  invalidBody: async () => {
    // DELETE sans corps : le seul paramètre est l'identifiant du membre dans l'adresse.
    const id = seeded.workspace.id;
    const res = await remove(call('DELETE', `/workspaces/${id}/members/123`, seeded.owner.headers), member(id, '123'));
    expect(res.status).toBe(400);
  },
  extra: {
    'EC-TEAM-05 : 409 quand le propriétaire se retire lui-même': async () => {
      const id = seeded.workspace.id;
      const res = await remove(call('DELETE', `/workspaces/${id}/members/${seeded.owner.id}`, seeded.owner.headers), member(id, seeded.owner.id));
      expect(res.status).toBe(409);
      expect(await roleOf(id, seeded.owner.id)).toBe('owner');
    },
    '403 workspace_suspended : espace suspendu': async () => {
      const s = await seedWorkspace({ status: 'suspended' });
      const id = s.workspace.id;
      const res = await remove(call('DELETE', `/workspaces/${id}/members/${s.viewer.id}`, s.owner.headers), member(id, s.viewer.id));
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_suspended');
    },
  },
});

describeRoute('transferOwnership', {
  success: async () => {
    const s = await seedWorkspace();
    const id = s.workspace.id;
    const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, s.owner.headers, { profile_id: s.editor.id }), ws(id));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ id, role: 'editor' });
    expect(await roleOf(id, s.editor.id)).toBe('owner');
    expect(await roleOf(id, s.owner.id)).toBe('editor');
    const { data } = await testServiceClient().from('workspaces').select('owner_id').eq('id', id).single();
    expect(data?.owner_id).toBe(s.editor.id);
    // L'ancien propriétaire ne peut plus gérer l'équipe.
    const again = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, s.owner.headers, { profile_id: s.owner.id }), ws(id));
    expect(again.status).toBe(403);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, { origin: APP }, { profile_id: seeded.editor.id }), ws(id));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, seeded.owner.headers, { profile_id: seeded.owner.id }), ws(id));
    expect(res.status).toBe(404);
    expect(await roleOf(id, seeded.stranger.id)).toBe('owner');
  },
  forbiddenRole: async () => {
    const id = seeded.workspace.id;
    const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, seeded.editor.headers, { profile_id: seeded.editor.id }), ws(id));
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const id = seeded.workspace.id;
    const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, seeded.owner.headers, { profile_id: 'moi' }), ws(id));
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([expect.objectContaining({ field: 'profile_id' })]);
  },
  extra: {
    '404 : la personne n’est pas membre de l’espace': async () => {
      const id = seeded.workspace.id;
      const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, seeded.owner.headers, { profile_id: randomUUID() }), ws(id));
      expect(res.status).toBe(404);
    },
    '409 : transfert à soi-même': async () => {
      const id = seeded.workspace.id;
      const res = await transfer(call('POST', `/workspaces/${id}/transfer-ownership`, seeded.owner.headers, { profile_id: seeded.owner.id }), ws(id));
      expect(res.status).toBe(409);
    },
  },
});
