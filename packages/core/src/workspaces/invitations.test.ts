import { describe, expect, it, vi } from 'vitest';
import type { Ctx, MemberCtx, MemberRole, WorkspaceAccess } from '../context';
import { FakeClient, type FakeResponse } from '../fake-client.test-helper';
import { acceptInvitation, inviteMember, type InvitationEmail } from './invitations';

const OWNER = '11111111-1111-4111-8111-111111111111';
const INVITEE = '22222222-2222-4222-8222-222222222222';
const WS = '44444444-4444-4444-8444-444444444444';
const INV = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-10-12T09:00:00Z');

const ok = (data: unknown): FakeResponse => ({ data, error: null });
const PLANS = ok([
  { code: 'starter', max_members: 1, max_pages: 1, campaigns_per_period: 2 },
  { code: 'pro', max_members: 2, max_pages: 3, campaigns_per_period: 5 },
]);
const PRO = ok([
  { workspace_id: WS, plan_code: 'pro', status: 'active', period_end: 'x', grace_until: null },
]);
const NO_SUBSCRIPTION = ok([]);
const rows = (n: number): FakeResponse =>
  ok(Array.from({ length: n }, (_, i) => ({ id: String(i) })));

const tokens = { create: () => 'jeton-secret-de-test', hash: (t: string) => `h(${t})` };

function ownerCtx(
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

function deps(send = vi.fn<(email: InvitationEmail) => Promise<void>>(() => Promise.resolve())) {
  return {
    tokens,
    sendInvitationEmail: send,
    acceptUrl: (t: string) => `https://app.test/invitation#${t}`,
  };
}

describe('inviteMember', () => {
  it('crée l’invitation (hachage seulement, 7 jours) et envoie l’e-mail avec le lien', async () => {
    const svc = new FakeClient().reply(
      ok([]), // aucun profil avec cet e-mail
      ok(null), // ancienne invitation supprimée
      PRO,
      PLANS,
      rows(1), // membres
      rows(0), // invitations en attente
      ok([
        {
          id: INV,
          email: 'bob@example.com',
          role: 'editor',
          expires_at: '2026-10-19T09:00:00.000Z',
        },
      ]),
      rows(1),
      rows(1),
    );
    const db = new FakeClient().reply(
      ok({ name: 'Boutique Awa' }),
      ok({ first_name: 'Awa', last_name: null }),
    );
    const send = vi.fn<(email: InvitationEmail) => Promise<void>>(() => Promise.resolve());
    const inv = await inviteMember(
      ownerCtx(db, svc),
      { email: ' Bob@Example.com ', role: 'editor' },
      deps(send),
    );
    expect(inv).toEqual({
      id: INV,
      email: 'bob@example.com',
      role: 'editor',
      expires_at: '2026-10-19T09:00:00.000Z',
    });
    const insert = svc.calls.find((c) => c.ops.some(([op]) => op === 'insert'));
    expect(insert?.ops).toContainEqual([
      'insert',
      {
        workspace_id: WS,
        email: 'bob@example.com',
        role: 'editor',
        token_hash: 'h(jeton-secret-de-test)',
        expires_at: '2026-10-19T09:00:00.000Z',
      },
    ]);
    expect(send).toHaveBeenCalledWith({
      invitationId: INV,
      to: 'bob@example.com',
      locale: 'fr',
      workspaceName: 'Boutique Awa',
      inviterName: 'Awa',
      acceptUrl: 'https://app.test/invitation#jeton-secret-de-test',
      expiresAt: new Date('2026-10-19T09:00:00.000Z'),
    });
    // L'ancienne invitation non acceptée de la même adresse est remplacée.
    expect(svc.calls[1]?.ops).toEqual(
      expect.arrayContaining([
        ['delete'],
        ['eq', 'workspace_id', WS],
        ['eq', 'email', 'bob@example.com'],
        ['is', 'accepted_at', null],
      ]),
    );
  });

  it('EC-TEAM-01 : personne déjà membre → conflict, sans invitation', async () => {
    const svc = new FakeClient().reply(ok([{ id: INVITEE }]), ok([{ profile_id: INVITEE }]));
    const send = vi.fn<(email: InvitationEmail) => Promise<void>>(() => Promise.resolve());
    await expect(
      inviteMember(
        ownerCtx(new FakeClient(), svc),
        { email: 'bob@example.com', role: 'viewer' },
        deps(send),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(svc.calls[1]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(send).not.toHaveBeenCalled();
  });

  it('limite de membres : sans formule (Starter, 1 membre) le propriétaire seul remplit l’espace → 402', async () => {
    const svc = new FakeClient().reply(
      ok([{ id: INVITEE }]),
      ok([]),
      ok(null),
      NO_SUBSCRIPTION,
      PLANS,
      rows(1),
      rows(0),
    );
    await expect(
      inviteMember(
        ownerCtx(new FakeClient(), svc),
        { email: 'bob@example.com', role: 'viewer' },
        deps(),
      ),
    ).rejects.toMatchObject({
      code: 'member_limit_reached',
      status: 402,
      opts: { meta: { members_limit: 1 } },
    });
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'insert'))).toBe(false);
  });

  it('limite de membres : les invitations en attente comptent (Pro, 1 membre + 1 invitation)', async () => {
    const svc = new FakeClient().reply(ok([]), ok(null), PRO, PLANS, rows(1), rows(1));
    await expect(
      inviteMember(
        ownerCtx(new FakeClient(), svc),
        { email: 'bob@example.com', role: 'viewer' },
        deps(),
      ),
    ).rejects.toMatchObject({ code: 'member_limit_reached' });
  });

  it('deux invitations simultanées : recomptage après l’écriture, invitation annulée → 402', async () => {
    const svc = new FakeClient().reply(
      ok([]),
      ok(null),
      PRO,
      PLANS,
      rows(1),
      rows(0),
      ok([{ id: INV, email: 'bob@example.com', role: 'viewer', expires_at: 'x' }]),
      rows(1),
      rows(2), // une autre invitation est arrivée entre-temps
      ok(null), // annulation
    );
    const send = vi.fn<(email: InvitationEmail) => Promise<void>>(() => Promise.resolve());
    await expect(
      inviteMember(
        ownerCtx(new FakeClient(), svc),
        { email: 'bob@example.com', role: 'viewer' },
        deps(send),
      ),
    ).rejects.toMatchObject({ code: 'member_limit_reached' });
    expect(svc.calls.at(-1)?.ops).toEqual(
      expect.arrayContaining([['delete'], ['eq', 'workspace_id', WS], ['eq', 'id', INV]]),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('e-mail non parti : invitation supprimée, internal_error ; nom absent → e-mail de l’invitant', async () => {
    const svc = new FakeClient().reply(
      ok([]),
      ok(null),
      PRO,
      PLANS,
      rows(1),
      rows(0),
      ok([{ id: INV, email: 'bob@example.com', role: 'viewer', expires_at: 'x' }]),
      rows(1),
      rows(1),
      ok(null),
    );
    const db = new FakeClient().reply(
      ok({ name: 'Boutique' }),
      ok({ first_name: null, last_name: ' ' }),
    );
    const send = vi.fn<(email: InvitationEmail) => Promise<void>>(() =>
      Promise.reject(new Error('resend down')),
    );
    await expect(
      inviteMember(ownerCtx(db, svc), { email: 'bob@example.com', role: 'viewer' }, deps(send)),
    ).rejects.toMatchObject({ code: 'internal_error' });
    expect(send.mock.calls[0]?.[0].inviterName).toBe('awa@example.com');
    expect(svc.calls.at(-1)?.ops).toContainEqual(['delete']);
  });

  it('éditeur → role_insufficient ; lecture seule → workspace_read_only ; rien n’est lu', async () => {
    const svc = new FakeClient();
    await expect(
      inviteMember(
        ownerCtx(new FakeClient(), svc, 'editor'),
        { email: 'b@x.io', role: 'viewer' },
        deps(),
      ),
    ).rejects.toMatchObject({ code: 'role_insufficient' });
    await expect(
      inviteMember(
        ownerCtx(new FakeClient(), svc, 'owner', 'read_only'),
        { email: 'b@x.io', role: 'viewer' },
        deps(),
      ),
    ).rejects.toMatchObject({ code: 'workspace_read_only' });
    expect(svc.calls).toHaveLength(0);
  });
});

describe('acceptInvitation', () => {
  function inviteeCtx(db: FakeClient, svc: FakeClient, email = 'bob@example.com'): Ctx {
    return {
      requestId: 'req_TEST',
      user: { id: INVITEE, email, locale: 'en', timezone: 'Africa/Abidjan' },
      db: db.asDb(),
      svc: svc.asService(),
      now: () => NOW,
    };
  }
  const invitation = (over: Record<string, unknown> = {}): FakeResponse =>
    ok({
      id: INV,
      workspace_id: WS,
      email: 'bob@example.com',
      role: 'editor',
      expires_at: '2026-10-19T09:00:00Z',
      accepted_at: null,
      ...over,
    });
  const view = (db: FakeClient): FakeClient =>
    db.reply(
      ok({ id: WS, name: 'Boutique', status: 'active' }),
      ok([{ workspace_id: WS }, { workspace_id: WS }]),
    );

  it('ajoute le membre avec le rôle invité et réserve l’invitation', async () => {
    const svc = new FakeClient().reply(
      invitation(),
      ok({ status: 'active' }),
      ok(null), // pas encore membre
      ok([{ id: INV }]), // réservation
      PRO,
      PLANS,
      rows(1),
      ok(null), // insertion du membre
      rows(2),
      PRO,
      PLANS,
    );
    const ws = await acceptInvitation(inviteeCtx(view(new FakeClient()), svc), 'jeton', tokens);
    expect(ws).toMatchObject({
      id: WS,
      role: 'editor',
      plan: 'pro',
      quotas: { members: 2, members_limit: 2 },
    });
    expect(svc.calls[0]?.ops).toContainEqual(['eq', 'token_hash', 'h(jeton)']);
    expect(svc.calls[3]?.ops).toEqual(
      expect.arrayContaining([
        ['update', { accepted_at: NOW.toISOString() }],
        ['is', 'accepted_at', null],
      ]),
    );
    expect(svc.calls[7]?.ops).toContainEqual([
      'insert',
      { workspace_id: WS, profile_id: INVITEE, role: 'editor' },
    ]);
  });

  it('jeton inconnu → not_found', async () => {
    const svc = new FakeClient().reply(ok(null));
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), svc), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('EC-TEAM-02 : compte avec un autre e-mail → forbidden, même si l’invitation est expirée', async () => {
    const svc = new FakeClient().reply(invitation({ accepted_at: '2026-10-01T00:00:00Z' }));
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), svc, 'mallory@example.com'), 'x', tokens),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(svc.calls).toHaveLength(1);
  });

  it('EC-TEAM-03 : invitation déjà utilisée ou expirée → gone', async () => {
    const used = new FakeClient().reply(invitation({ accepted_at: '2026-10-11T00:00:00Z' }));
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), used, 'BOB@example.com'), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'gone',
      status: 410,
    });
    const expired = new FakeClient().reply(invitation({ expires_at: NOW.toISOString() }));
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), expired), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'gone',
    });
  });

  it('EC-TEAM-03 : double clic, la réservation échoue → gone', async () => {
    const svc = new FakeClient().reply(invitation(), ok({ status: 'active' }), ok(null), ok([]));
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), svc), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'gone',
    });
  });

  it('espace suspendu, en lecture seule ou disparu → refus', async () => {
    for (const [status, code] of [
      ['suspended', 'workspace_suspended'],
      ['read_only', 'workspace_read_only'],
    ] as const) {
      const svc = new FakeClient().reply(invitation(), ok({ status }));
      await expect(
        acceptInvitation(inviteeCtx(new FakeClient(), svc), 'x', tokens),
      ).rejects.toMatchObject({ code });
    }
    const gone = new FakeClient().reply(invitation(), ok(null));
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), gone), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'gone',
    });
  });

  it('déjà membre : l’invitation est consommée et l’espace rendu avec le rôle actuel', async () => {
    const svc = new FakeClient().reply(
      invitation(),
      ok({ status: 'active' }),
      ok({ role: 'viewer' }),
      ok([{ id: INV }]),
      PRO,
      PLANS,
    );
    const ws = await acceptInvitation(inviteeCtx(view(new FakeClient()), svc), 'x', tokens);
    expect(ws.role).toBe('viewer');
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'insert'))).toBe(false);
  });

  it('limite de membres atteinte → 402 et invitation rendue (réservation annulée)', async () => {
    const svc = new FakeClient().reply(
      invitation(),
      ok({ status: 'active' }),
      ok(null),
      ok([{ id: INV }]),
      PRO,
      PLANS,
      rows(2),
      ok(null),
    );
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), svc), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'member_limit_reached',
    });
    expect(svc.calls.at(-1)?.ops).toContainEqual(['update', { accepted_at: null }]);
  });

  it('deux acceptations simultanées : recomptage après l’ajout, retrait et 402', async () => {
    const svc = new FakeClient().reply(
      invitation(),
      ok({ status: 'active' }),
      ok(null),
      ok([{ id: INV }]),
      PRO,
      PLANS,
      rows(1),
      ok(null),
      rows(3),
      ok(null), // retrait du membre
      ok(null), // réservation annulée
    );
    await expect(
      acceptInvitation(inviteeCtx(new FakeClient(), svc), 'x', tokens),
    ).rejects.toMatchObject({
      code: 'member_limit_reached',
    });
    expect(svc.calls[9]?.ops).toEqual(
      expect.arrayContaining([['delete'], ['eq', 'profile_id', INVITEE]]),
    );
    expect(svc.calls[10]?.ops).toContainEqual(['update', { accepted_at: null }]);
  });
});
