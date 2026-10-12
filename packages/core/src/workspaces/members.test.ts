import { describe, expect, it } from 'vitest';
import type { MemberCtx, MemberRole, WorkspaceAccess } from '../context';
import { FakeClient } from '../fake-client.test-helper';
import { changeMemberRole, listMembers, removeMember } from './members';
import { RECENT_LOGIN_MS, transferOwnership } from './transfer-ownership';

const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';
const WS = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-12T09:00:00Z');

function ctx(
  db: FakeClient,
  svc: FakeClient,
  role: MemberRole = 'owner',
  access: WorkspaceAccess = 'active',
): MemberCtx {
  return {
    requestId: 'req_TEST',
    user: { id: OWNER, email: 'awa@example.com', locale: 'fr', timezone: 'Africa/Douala' },
    db: db.asDb(),
    svc: svc.asService(),
    now: () => NOW,
    workspace: { id: WS, role, access },
  };
}

const profiles = {
  data: [
    { id: OWNER, email: 'awa@example.com', first_name: 'Awa', last_name: 'Diop' },
    { id: EDITOR, email: 'ed@example.com', first_name: null, last_name: ' ' },
    { id: VIEWER, email: 'vi@example.com', first_name: 'Vi', last_name: null },
  ],
  error: null,
};

describe('listMembers', () => {
  it('le propriétaire d’abord, puis par date d’arrivée, avec e-mail et nom', async () => {
    const db = new FakeClient().reply({
      data: [
        { profile_id: EDITOR, role: 'editor', joined_at: '2026-10-01T00:00:00Z' },
        { profile_id: OWNER, role: 'owner', joined_at: '2026-10-02T00:00:00Z' },
        { profile_id: VIEWER, role: 'viewer', joined_at: '2026-10-03T00:00:00Z' },
      ],
      error: null,
    });
    const svc = new FakeClient().reply(profiles);
    const members = await listMembers(ctx(db, svc, 'viewer'));
    expect(members).toEqual([
      {
        profile_id: OWNER,
        email: 'awa@example.com',
        name: 'Awa Diop',
        role: 'owner',
        joined_at: '2026-10-02T00:00:00Z',
      },
      {
        profile_id: EDITOR,
        email: 'ed@example.com',
        role: 'editor',
        joined_at: '2026-10-01T00:00:00Z',
      },
      {
        profile_id: VIEWER,
        email: 'vi@example.com',
        name: 'Vi',
        role: 'viewer',
        joined_at: '2026-10-03T00:00:00Z',
      },
    ]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(svc.calls[0]?.ops).toContainEqual(['in', 'id', [OWNER, EDITOR, VIEWER]]);
  });

  it('aucune ligne visible : liste vide sans lire les profils', async () => {
    const svc = new FakeClient();
    expect(await listMembers(ctx(new FakeClient().reply({ data: [], error: null }), svc))).toEqual(
      [],
    );
    expect(svc.calls).toHaveLength(0);
  });
});

describe('changeMemberRole / removeMember', () => {
  it('change le rôle, filtré par espace et par membre, jamais celui du propriétaire', async () => {
    const db = new FakeClient().reply({
      data: { profile_id: EDITOR, role: 'editor', joined_at: '2026-10-01T00:00:00Z' },
      error: null,
    });
    const svc = new FakeClient().reply(
      {
        data: [{ profile_id: EDITOR, role: 'viewer', joined_at: '2026-10-01T00:00:00Z' }],
        error: null,
      },
      profiles,
    );
    const member = await changeMemberRole(ctx(db, svc), EDITOR, 'viewer');
    expect(member).toMatchObject({ profile_id: EDITOR, role: 'viewer', email: 'ed@example.com' });
    expect(svc.calls[0]?.ops).toEqual(
      expect.arrayContaining([
        ['update', { role: 'viewer' }],
        ['eq', 'workspace_id', WS],
        ['eq', 'profile_id', EDITOR],
        ['neq', 'role', 'owner'],
      ]),
    );
  });

  it('EC-TEAM-05 : le propriétaire ne change pas son propre rôle et ne se retire pas', async () => {
    const db = new FakeClient();
    await expect(
      changeMemberRole(ctx(db, new FakeClient()), OWNER, 'editor'),
    ).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(removeMember(ctx(db, new FakeClient()), OWNER)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(db.calls).toHaveLength(0);
  });

  it('cible propriétaire (autre ligne owner) → conflict ; cible absente → not_found', async () => {
    const owner = new FakeClient().reply({
      data: { profile_id: EDITOR, role: 'owner', joined_at: 'x' },
      error: null,
    });
    await expect(removeMember(ctx(owner, new FakeClient()), EDITOR)).rejects.toMatchObject({
      code: 'conflict',
    });
    const none = new FakeClient().reply({ data: null, error: null });
    await expect(removeMember(ctx(none, new FakeClient()), EDITOR)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('éditeur → role_insufficient ; espace suspendu → workspace_suspended', async () => {
    await expect(
      changeMemberRole(ctx(new FakeClient(), new FakeClient(), 'editor'), VIEWER, 'editor'),
    ).rejects.toMatchObject({ code: 'role_insufficient' });
    await expect(
      removeMember(ctx(new FakeClient(), new FakeClient(), 'owner', 'suspended'), VIEWER),
    ).rejects.toMatchObject({ code: 'workspace_suspended' });
  });

  it('retire le membre, filtré par espace', async () => {
    const db = new FakeClient().reply({
      data: { profile_id: VIEWER, role: 'viewer', joined_at: 'x' },
      error: null,
    });
    const svc = new FakeClient().reply({ data: null, error: null });
    await removeMember(ctx(db, svc), VIEWER);
    expect(svc.calls[0]?.ops).toEqual(
      expect.arrayContaining([
        ['delete'],
        ['eq', 'workspace_id', WS],
        ['eq', 'profile_id', VIEWER],
      ]),
    );
  });

  it('mise à jour sans ligne rendue → not_found', async () => {
    const db = new FakeClient().reply({
      data: { profile_id: EDITOR, role: 'editor', joined_at: 'x' },
      error: null,
    });
    const svc = new FakeClient().reply({ data: [], error: null });
    await expect(changeMemberRole(ctx(db, svc), EDITOR, 'viewer')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('transferOwnership (EC-TEAM-06)', () => {
  function withLogin(
    svc: FakeClient,
    lastSignInAt: string | undefined,
    error: unknown = null,
  ): FakeClient {
    return Object.assign(svc, {
      auth: {
        admin: {
          getUserById: () =>
            Promise.resolve(
              error === null
                ? { data: { user: { id: OWNER, last_sign_in_at: lastSignInAt } }, error: null }
                : { data: { user: null }, error },
            ),
        },
      },
    });
  }
  const recent = new Date(NOW.getTime() - 60_000).toISOString();

  it('transfère au membre, puis rend l’espace avec le rôle éditeur', async () => {
    const db = new FakeClient().reply(
      { data: { profile_id: EDITOR }, error: null },
      { data: { id: WS, name: 'Boutique', status: 'active' }, error: null },
      { data: [{ workspace_id: WS }, { workspace_id: WS }], error: null },
    );
    const svc = withLogin(new FakeClient(), recent).reply(
      { data: null, error: null },
      { data: [], error: null },
      {
        data: [{ code: 'starter', max_members: 1, max_pages: 1, campaigns_per_period: 2 }],
        error: null,
      },
    );
    const ws = await transferOwnership(ctx(db, svc), EDITOR);
    expect(ws).toMatchObject({ id: WS, role: 'editor' });
    expect(svc.calls[0]).toEqual({
      target: 'rpc:transfer_ownership',
      ops: [['args', { ws: WS, new_owner: EDITOR, actor: OWNER }]],
    });
  });

  it('connexion de plus de 5 minutes → mfa_required (recent_login_required), sans transfert', async () => {
    const db = new FakeClient().reply({ data: { profile_id: EDITOR }, error: null });
    const old = new Date(NOW.getTime() - RECENT_LOGIN_MS - 1000).toISOString();
    const svc = withLogin(new FakeClient(), old);
    await expect(transferOwnership(ctx(db, svc), EDITOR)).rejects.toMatchObject({
      code: 'mfa_required',
      opts: { meta: { reason: 'recent_login_required' } },
    });
    expect(svc.calls).toHaveLength(0);
    const never = withLogin(new FakeClient(), undefined);
    const db2 = new FakeClient().reply({ data: { profile_id: EDITOR }, error: null });
    await expect(transferOwnership(ctx(db2, never), EDITOR)).rejects.toMatchObject({
      code: 'mfa_required',
    });
  });

  it('erreur de Supabase Auth → internal_error', async () => {
    const db = new FakeClient().reply({ data: { profile_id: EDITOR }, error: null });
    const svc = withLogin(new FakeClient(), undefined, { message: 'down' });
    await expect(transferOwnership(ctx(db, svc), EDITOR)).rejects.toMatchObject({
      code: 'internal_error',
    });
  });

  it('à soi-même → conflict ; à un non-membre → not_found ; éditeur → role_insufficient', async () => {
    await expect(
      transferOwnership(ctx(new FakeClient(), new FakeClient()), OWNER),
    ).rejects.toMatchObject({
      code: 'conflict',
    });
    const none = new FakeClient().reply({ data: null, error: null });
    await expect(transferOwnership(ctx(none, new FakeClient()), VIEWER)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      transferOwnership(ctx(new FakeClient(), new FakeClient(), 'editor'), VIEWER),
    ).rejects.toMatchObject({ code: 'role_insufficient' });
  });
});
