// Bilan de santé Meta contre la pile Supabase locale et la fausse Meta : les 5 cas de la route
// (API_SPEC §15) et EC-META-01. Aucun appel à un vrai service Meta.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { POST as healthCheck } from '../workspaces/[workspaceId]/meta/connections/[connectionId]/health-check/route';
import { call, conn, connectWorkspace, connectionRows, idOf, json } from './int-support';

let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

describeRoute('runHealthCheck', {
  success: async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    const res = await healthCheck(
      call(
        'POST',
        `/workspaces/${s.workspace.id}/meta/connections/${idOf(c)}/health-check`,
        s.owner.headers,
      ),
      conn(s.workspace.id, idOf(c)),
    );
    expect(res.status).toBe(200);
    const body = (await json(res)) as {
      checked_at: string;
      items: { key: string; ok: boolean; required?: boolean }[];
    };
    expect(body.items.map((i) => i.key)).toEqual([
      'business_portfolio',
      'ad_account',
      'payment_method',
      'page',
      'instagram',
      'whatsapp',
      'pixel',
      'permissions',
    ]);
    expect(body.items.every((i) => i.ok)).toBe(true);
    expect(body.items.find((i) => i.key === 'ad_account')?.required).toBe(true);
    // Le bilan est conservé sur la connexion, et le compte sait qu'il a un moyen de paiement.
    const stored = await testServiceClient()
      .from('meta_connections')
      .select('last_health_check')
      .eq('id', idOf(c))
      .single();
    expect(stored.data?.last_health_check).toMatchObject({ checked_at: body.checked_at });
    const account = await testServiceClient()
      .from('ad_accounts')
      .select('has_payment_method')
      .eq('workspace_id', s.workspace.id)
      .single();
    expect(account.data?.has_payment_method).toBe(true);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await healthCheck(
      call('POST', `/workspaces/${id}/meta/connections/${randomUUID()}/health-check`, {}),
      conn(id, randomUUID()),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    // Autre espace : 404, et une connexion d'un autre espace n'est jamais lisible par son identifiant.
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    const other = await healthCheck(
      call(
        'POST',
        `/workspaces/${s.strangerWorkspace.id}/meta/connections/${idOf(c)}/health-check`,
        s.stranger.headers,
      ),
      conn(s.strangerWorkspace.id, idOf(c)),
    );
    expect(other.status).toBe(404);
    const foreign = await healthCheck(
      call(
        'POST',
        `/workspaces/${s.workspace.id}/meta/connections/${idOf(c)}/health-check`,
        s.stranger.headers,
      ),
      conn(s.workspace.id, idOf(c)),
    );
    expect(foreign.status).toBe(404);
  },
  forbiddenRole: async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    for (const user of [s.editor, s.viewer]) {
      const res = await healthCheck(
        call(
          'POST',
          `/workspaces/${s.workspace.id}/meta/connections/${idOf(c)}/health-check`,
          user.headers,
        ),
        conn(s.workspace.id, idOf(c)),
      );
      expect(res.status).toBe(403);
    }
  },
  invalidBody: async () => {
    const id = seeded.workspace.id;
    const res = await healthCheck(
      call(
        'POST',
        `/workspaces/${id}/meta/connections/pas-un-uuid/health-check`,
        seeded.owner.headers,
      ),
      conn(id, 'pas-un-uuid'),
    );
    expect(res.status).toBe(400);
  },
  extra: {
    'EC-META-01 : connexion expirée → 424 meta_token_expired, statut enregistré': async () => {
      const s = await seedWorkspace();
      await connectWorkspace(s);
      const [c] = await connectionRows(s.workspace.id);
      await testServiceClient()
        .from('meta_connections')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', idOf(c));
      const res = await healthCheck(
        call(
          'POST',
          `/workspaces/${s.workspace.id}/meta/connections/${idOf(c)}/health-check`,
          s.owner.headers,
        ),
        conn(s.workspace.id, idOf(c)),
      );
      expect(res.status).toBe(424);
      expect((await json(res)).code).toBe('meta_token_expired');
      expect((await connectionRows(s.workspace.id))[0]?.status).toBe('expired');
    },
  },
});
