import { describe, expect, it } from 'vitest';
import type { MemberCtx, MemberRole, WorkspaceAccess } from '../context';
import { FakeClient, type FakeResponse } from '../fake-client.test-helper';
import { assertNotSuspended, assertRole, assertWritable } from './guards';
import { assertMembersFitPlan, subscriptionsOf } from './plan-limits';
import { getWorkspace, listWorkspaces, renameWorkspace } from './workspaces';

const USER = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';
const WS2 = '33333333-3333-4333-8333-333333333333';

const PLANS: FakeResponse = {
  data: [
    { code: 'starter', max_members: 1, max_pages: 1, campaigns_per_period: 2 },
    { code: 'pro', max_members: 2, max_pages: 3, campaigns_per_period: 5 },
    { code: 'business', max_members: 5, max_pages: 10, campaigns_per_period: 15 },
  ],
  error: null,
};

function ctx(
  db: FakeClient,
  svc: FakeClient,
  role: MemberRole = 'owner',
  access: WorkspaceAccess = 'active',
): MemberCtx {
  return {
    requestId: 'req_TEST',
    user: { id: USER, email: 'awa@example.com', locale: 'fr', timezone: 'Africa/Douala' },
    db: db.asDb(),
    svc: svc.asService(),
    now: () => new Date('2026-10-12T09:00:00Z'),
    workspace: { id: WS, role, access },
  };
}

describe('assertRole / assertWritable (SECURITY_NOTES §2.7)', () => {
  it('refuse un rôle absent de la liste', () => {
    const c = ctx(new FakeClient(), new FakeClient(), 'editor');
    expect(() => {
      assertRole(c, ['owner']);
    }).toThrow(expect.objectContaining({ code: 'role_insufficient' }));
    expect(() => {
      assertRole(c, ['owner', 'editor']);
    }).not.toThrow();
  });

  it('lecture seule et suspension refusées ; la grâce reste modifiable', () => {
    const f = new FakeClient();
    expect(() => {
      assertWritable(ctx(f, f, 'owner', 'read_only'));
    }).toThrow(expect.objectContaining({ code: 'workspace_read_only' }));
    expect(() => {
      assertWritable(ctx(f, f, 'owner', 'suspended'));
    }).toThrow(expect.objectContaining({ code: 'workspace_suspended' }));
    expect(() => {
      assertWritable(ctx(f, f, 'owner', 'grace'));
    }).not.toThrow();
  });
});

describe('assertNotSuspended (paiement et preuve de paiement, décision 4)', () => {
  it('permis en lecture seule et en grâce, refusé en suspension', () => {
    const f = new FakeClient();
    for (const access of ['active', 'grace', 'read_only'] as const) {
      expect(() => {
        assertNotSuspended(ctx(f, f, 'owner', access));
      }).not.toThrow();
    }
    expect(() => {
      assertNotSuspended(ctx(f, f, 'owner', 'suspended'));
    }).toThrow(expect.objectContaining({ code: 'workspace_suspended' }));
  });
});

describe('subscriptionsOf : formule de chaque espace', () => {
  it('abonnement le plus récent ; essai → trial ; aucun abonnement → trial et limites Starter', async () => {
    const svc = new FakeClient().reply({
      data: [
        {
          workspace_id: WS,
          plan_code: 'pro',
          status: 'active',
          period_end: '2026-11-01T00:00:00Z',
          grace_until: null,
        },
        {
          workspace_id: WS,
          plan_code: 'starter',
          status: 'canceled',
          period_end: '2026-09-01T00:00:00Z',
          grace_until: null,
        },
        {
          workspace_id: WS2,
          plan_code: 'business',
          status: 'trialing',
          period_end: '2026-10-19T00:00:00Z',
          grace_until: null,
        },
      ],
      error: null,
    });
    const third = '44444444-4444-4444-8444-444444444444';
    const subs = await subscriptionsOf(svc.asService(), [WS, WS2, third]);
    expect(subs.get(WS)).toMatchObject({
      plan: 'pro',
      limitsOf: 'pro',
      period_end: '2026-11-01T00:00:00Z',
    });
    expect(subs.get(WS2)).toMatchObject({ plan: 'trial', limitsOf: 'business' });
    expect(subs.get(third)).toEqual({
      plan: 'trial',
      limitsOf: 'starter',
      status: null,
      period_end: null,
      grace_until: null,
    });
    expect(svc.calls[0]?.ops).toContainEqual(['order', 'created_at', { ascending: false }]);
  });

  it('formule inconnue en base → internal_error', async () => {
    const svc = new FakeClient().reply({
      data: [
        {
          workspace_id: WS,
          plan_code: 'gold',
          status: 'active',
          period_end: 'x',
          grace_until: null,
        },
      ],
      error: null,
    });
    await expect(subscriptionsOf(svc.asService(), [WS])).rejects.toMatchObject({
      code: 'internal_error',
    });
  });
});

describe('EC-TEAM-07 : formule inférieure avec trop de membres', () => {
  it('refuse le passage à Starter avec 3 membres, en donnant le nombre à retirer', async () => {
    const svc = new FakeClient().reply(
      { data: [{ profile_id: 'a' }, { profile_id: 'b' }, { profile_id: 'c' }], error: null },
      PLANS,
    );
    const err = await assertMembersFitPlan(
      { requestId: 'r', svc: svc.asService(), now: () => new Date() },
      WS,
      'pro',
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'member_limit_reached',
      status: 402,
      opts: { meta: { members: 3, members_limit: 2, members_to_remove: 1 } },
    });
    expect(svc.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
  });

  it('accepte quand les membres tiennent dans la nouvelle formule', async () => {
    const svc = new FakeClient().reply(
      { data: [{ profile_id: 'a' }, { profile_id: 'b' }], error: null },
      PLANS,
    );
    await expect(
      assertMembersFitPlan(
        { requestId: 'r', svc: svc.asService(), now: () => new Date() },
        WS,
        'pro',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('listWorkspaces', () => {
  it('rend les espaces de l’utilisateur avec rôle, formule et quotas', async () => {
    const db = new FakeClient().reply(
      {
        data: [
          { workspace_id: WS, role: 'owner' },
          { workspace_id: WS2, role: 'viewer' },
        ],
        error: null,
      },
      {
        data: [
          { id: WS, name: 'Boutique Awa', status: 'active' },
          { id: WS2, name: 'Agence', status: 'read_only' },
        ],
        error: null,
      },
      { data: [{ workspace_id: WS }, { workspace_id: WS2 }, { workspace_id: WS2 }], error: null },
    );
    const svc = new FakeClient().reply(
      {
        data: [
          {
            workspace_id: WS2,
            plan_code: 'pro',
            status: 'read_only',
            period_end: '2026-10-01T00:00:00Z',
            grace_until: '2026-10-04T00:00:00Z',
          },
        ],
        error: null,
      },
      PLANS,
    );
    const list = await listWorkspaces(ctx(db, svc));
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'profile_id', USER]);
    expect(list).toEqual([
      {
        id: WS,
        name: 'Boutique Awa',
        status: 'active',
        status_cause: null,
        role: 'owner',
        plan: 'trial',
        period_end: null,
        grace_until: null,
        quotas: { members: 1, members_limit: 1, pages_limit: 1, campaigns_limit: 2 },
      },
      {
        id: WS2,
        name: 'Agence',
        status: 'read_only',
        status: 'read_only',
        status_cause: 'admin',
        role: 'viewer',
        plan: 'pro',
        period_end: '2026-10-01T00:00:00Z',
        grace_until: '2026-10-04T00:00:00Z',
        quotas: { members: 2, members_limit: 2, pages_limit: 3, campaigns_limit: 5 },
      },
    ]);
  });

  it('aucun espace : liste vide, sans autre requête', async () => {
    const db = new FakeClient().reply({ data: [], error: null });
    expect(await listWorkspaces(ctx(db, new FakeClient()))).toEqual([]);
    expect(db.calls).toHaveLength(1);
  });
});

describe('getWorkspace / renameWorkspace', () => {
  function workspaceReplies(db: FakeClient, svc: FakeClient, name = 'Boutique Awa'): void {
    db.reply(
      { data: { id: WS, name, status: 'active' }, error: null },
      { data: [{ workspace_id: WS }], error: null },
    );
    svc.reply({ data: [], error: null }, PLANS);
  }

  it('lit l’espace de la requête, filtré par son identifiant', async () => {
    const db = new FakeClient();
    const svc = new FakeClient();
    workspaceReplies(db, svc);
    const ws = await getWorkspace(ctx(db, svc, 'editor'));
    expect(ws).toMatchObject({ id: WS, role: 'editor', plan: 'trial' });
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'id', WS]);
  });

  it.each([
    ['2026-10-11T09:00:00Z', 'grace'],
    ['2026-10-09T09:00:00Z', 'read_only'],
    ['2026-11-01T09:00:00Z', 'active'],
  ] as const)(
    'TR-PAY-07 : abonnement finissant le %s → statut renvoyé « %s » (now = 12/10/2026)',
    async (periodEnd, expected) => {
      const db = new FakeClient().reply(
        { data: { id: WS, name: 'B', status: 'active' }, error: null },
        { data: [{ workspace_id: WS }], error: null },
      );
      const svc = new FakeClient().reply(
        {
          data: [
            {
              workspace_id: WS,
              plan_code: 'pro',
              status: 'active',
              period_end: periodEnd,
              grace_until: null,
            },
          ],
          error: null,
        },
        PLANS,
      );
      expect((await getWorkspace(ctx(db, svc))).status).toBe(expected);
    },
  );

  it.each([
    ['active', 'active', '2026-11-01T09:00:00Z', null],
    ['active', 'active', '2026-10-11T09:00:00Z', 'grace'],
    ['active', 'active', '2026-10-09T09:00:00Z', 'subscription_ended'],
    ['active', 'trialing', '2026-10-09T09:00:00Z', 'trial_ended'],
    ['active', 'canceled', '2026-10-09T09:00:00Z', 'subscription_ended'],
    ['read_only', 'trialing', '2026-11-01T09:00:00Z', 'admin'],
    ['suspended', 'active', '2026-11-01T09:00:00Z', 'admin'],
  ] as const)(
    'cause du statut : espace %s, abonnement %s finissant le %s → %s',
    async (stored, subStatus, periodEnd, cause) => {
      const db = new FakeClient().reply(
        { data: { id: WS, name: 'B', status: stored }, error: null },
        { data: [{ workspace_id: WS }], error: null },
      );
      const svc = new FakeClient().reply(
        {
          data: [
            {
              workspace_id: WS,
              plan_code: 'pro',
              status: subStatus,
              period_end: periodEnd,
              grace_until: null,
            },
          ],
          error: null,
        },
        PLANS,
      );
      expect((await getWorkspace(ctx(db, svc))).status_cause).toBe(cause);
    },
  );

  it('sans abonnement : actif, aucune cause (jamais « essai terminé »)', async () => {
    const db = new FakeClient().reply(
      { data: { id: WS, name: 'B', status: 'active' }, error: null },
      { data: [{ workspace_id: WS }], error: null },
    );
    const svc = new FakeClient().reply({ data: [], error: null }, PLANS);
    const view = await getWorkspace(ctx(db, svc));
    expect(view.status).toBe('active');
    expect(view.status_cause).toBeNull();
  });

  it('renomme (propriétaire) puis relit l’espace', async () => {
    const db = new FakeClient().reply({ data: [{ id: WS }], error: null });
    const svc = new FakeClient();
    workspaceReplies(db, svc, 'Nouveau nom');
    const ws = await renameWorkspace(ctx(db, svc), 'Nouveau nom');
    expect(ws.name).toBe('Nouveau nom');
    expect(db.calls[0]?.ops).toContainEqual(['update', { name: 'Nouveau nom' }]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'id', WS]);
  });

  it('éditeur → role_insufficient ; lecture seule → workspace_read_only ; sans écriture', async () => {
    const db = new FakeClient();
    await expect(renameWorkspace(ctx(db, new FakeClient(), 'editor'), 'X')).rejects.toMatchObject({
      code: 'role_insufficient',
    });
    await expect(
      renameWorkspace(ctx(db, new FakeClient(), 'owner', 'read_only'), 'X'),
    ).rejects.toMatchObject({ code: 'workspace_read_only' });
    expect(db.calls).toHaveLength(0);
  });

  it('aucune ligne modifiée (RLS) → not_found', async () => {
    const db = new FakeClient().reply({ data: [], error: null });
    await expect(renameWorkspace(ctx(db, new FakeClient()), 'X')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
