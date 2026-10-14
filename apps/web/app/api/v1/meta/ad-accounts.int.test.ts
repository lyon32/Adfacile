// Comptes publicitaires contre la pile Supabase locale et la fausse Meta : les 5 cas de chaque
// route (API_SPEC §15). Un seul compte actif par espace.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { POST as activate } from '../workspaces/[workspaceId]/ad-accounts/[adAccountId]/activate/route';
import { GET as listAdAccounts } from '../workspaces/[workspaceId]/ad-accounts/route';
import { call, connectWorkspace, connectionRows, idOf, json, ws } from './int-support';

let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

const accountParams = (workspaceId: string, adAccountId: string) => ({
  params: Promise.resolve({ workspaceId, adAccountId }),
});

/** Espace connecté (un compte, actif d'office) + un second compte publicitaire. */
async function connectedWithTwoAccounts() {
  const s = await seedWorkspace();
  await connectWorkspace(s);
  const svc = testServiceClient();
  const [connection] = await connectionRows(s.workspace.id);
  const inserted = await svc
    .from('ad_accounts')
    .insert({
      workspace_id: s.workspace.id,
      meta_connection_id: idOf(connection),
      meta_ad_account_id: 'act_100000000002',
      name: 'Second compte',
      currency: 'XAF',
    })
    .select('id')
    .single();
  const { data } = await svc
    .from('ad_accounts')
    .select('id, is_active')
    .eq('workspace_id', s.workspace.id);
  const active = data?.find((a) => a.is_active);
  if (active === undefined || inserted.data === null) throw new Error('comptes attendus');
  return { s, active: active.id, second: inserted.data.id };
}

function activateRequest(s: SeededWorkspace, user: SeededWorkspace['owner'], accountId: string) {
  return activate(
    call('POST', `/workspaces/${s.workspace.id}/ad-accounts/${accountId}/activate`, user.headers),
    accountParams(s.workspace.id, accountId),
  );
}

describeRoute('listAdAccounts', {
  success: async () => {
    const { s, active } = await connectedWithTwoAccounts();
    for (const user of [s.owner, s.editor, s.viewer]) {
      const res = await listAdAccounts(
        call('GET', `/workspaces/${s.workspace.id}/ad-accounts`, user.headers),
        ws(s.workspace.id),
      );
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as {
        data: { id: string; meta_ad_account_id: string; is_active: boolean; currency: string }[];
      };
      expect(data.map((a) => a.meta_ad_account_id).sort()).toEqual([
        'act_100000000001',
        'act_100000000002',
      ]);
      expect(data.filter((a) => a.is_active).map((a) => a.id)).toEqual([active]);
      expect(JSON.stringify(data)).not.toMatch(/token|sealed/i);
    }
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    expect(
      (await listAdAccounts(call('GET', `/workspaces/${id}/ad-accounts`, {}), ws(id))).status,
    ).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await listAdAccounts(
      call('GET', `/workspaces/${id}/ad-accounts`, seeded.owner.headers),
      ws(id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('tout membre voit les comptes publicitaires (SECURITY_NOTES §2.3)'),
  invalidBody: na('GET sans corps'),
});

describeRoute('activateAdAccount', {
  success: async () => {
    const { s, second } = await connectedWithTwoAccounts();
    const res = await activateRequest(s, s.owner, second);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ id: second, is_active: true });
    // Un seul compte actif : le premier a été désactivé.
    const { data } = await testServiceClient()
      .from('ad_accounts')
      .select('id')
      .eq('workspace_id', s.workspace.id)
      .eq('is_active', true);
    expect(data?.map((a) => a.id)).toEqual([second]);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const accountId = randomUUID();
    const res = await activate(
      call('POST', `/workspaces/${id}/ad-accounts/${accountId}/activate`, {}),
      accountParams(id, accountId),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const { s, second } = await connectedWithTwoAccounts();
    // Compte d'un autre espace dans mon espace : 404 ; dans le sien : 404 aussi.
    const mine = await activateRequest(s, s.stranger, second);
    expect(mine.status).toBe(404);
    const res = await activate(
      call(
        'POST',
        `/workspaces/${s.strangerWorkspace.id}/ad-accounts/${second}/activate`,
        s.stranger.headers,
      ),
      accountParams(s.strangerWorkspace.id, second),
    );
    expect(res.status).toBe(404);
    const row = await testServiceClient()
      .from('ad_accounts')
      .select('is_active')
      .eq('id', second)
      .single();
    expect(row.data?.is_active).toBe(false);
  },
  forbiddenRole: async () => {
    const { s, second } = await connectedWithTwoAccounts();
    for (const user of [s.editor, s.viewer]) {
      expect((await activateRequest(s, user, second)).status).toBe(403);
    }
    const row = await testServiceClient()
      .from('ad_accounts')
      .select('is_active')
      .eq('id', second)
      .single();
    expect(row.data?.is_active).toBe(false);
  },
  invalidBody: async () => {
    const id = seeded.workspace.id;
    const res = await activate(
      call('POST', `/workspaces/${id}/ad-accounts/pas-un-uuid/activate`, seeded.owner.headers),
      accountParams(id, 'pas-un-uuid'),
    );
    expect(res.status).toBe(400);
  },
  extra: {
    'un espace en lecture seule refuse le changement (403 workspace_read_only)': async () => {
      const { s, second } = await connectedWithTwoAccounts();
      await testServiceClient()
        .from('workspaces')
        .update({ status: 'read_only' })
        .eq('id', s.workspace.id);
      const res = await activateRequest(s, s.owner, second);
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_read_only');
    },
  },
});
