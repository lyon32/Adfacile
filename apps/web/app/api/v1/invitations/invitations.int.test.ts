// Invitations d'équipe contre la pile Supabase locale (API_SPEC §15 : les 5 cas ;
// SECURITY_NOTES EC-TEAM-01 à 03 ; limite de membres par formule). E-mails : faux
// fournisseur (PUBEKA_FAKE_PROVIDERS=all), aucun vrai e-mail n'est envoyé.
import { randomUUID } from 'node:crypto';
import {
  createTestUser,
  describeRoute,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
  type TestUser,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { POST as invite } from '../workspaces/[workspaceId]/invitations/route';
import { POST as accept } from './accept/route';
import { fakeOutbox } from './invitation-services';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let seeded: SeededWorkspace;

/** Abonnement actif d'une formule donnée (les limites viennent de `plans`). */
async function subscribe(workspaceId: string, plan: 'starter' | 'pro' | 'business'): Promise<void> {
  const { error } = await testServiceClient().from('subscriptions').insert({
    workspace_id: workspaceId,
    plan_code: plan,
    status: 'active',
    period_start: '2026-10-01T00:00:00Z',
    period_end: '2099-01-01T00:00:00Z',
  });
  if (error !== null) throw new Error(error.message);
}

/** Espace d'un nouvel utilisateur (propriétaire seul) avec la formule donnée. */
async function ownerWorkspace(plan: 'pro' | 'business'): Promise<{ workspace: { id: string }; owner: TestUser }> {
  const owner = await createTestUser({ label: `${plan}-owner` });
  const { data, error } = await testServiceClient().from('workspaces').select('id').eq('owner_id', owner.id).single();
  if (error !== null) throw new Error(error.message);
  await subscribe(data.id, plan);
  return { workspace: { id: data.id }, owner };
}

beforeAll(async () => {
  seeded = await seedWorkspace();
  await subscribe(seeded.workspace.id, 'business');
});

function call(path: string, headers: Record<string, string>, body?: unknown): Request {
  return new Request(`${APP}/api/v1${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.${String(Math.floor(Math.random() * 250))}.3.1`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ws = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Jeton lu dans le dernier e-mail envoyé à cette adresse (lien `/invitation#<jeton>`). */
function tokenSentTo(email: string): string {
  const message = [...fakeOutbox].reverse().find((m) => m.to === email);
  const token = /\/invitation#([A-Za-z0-9_-]{43})/.exec(message?.text ?? '')?.[1];
  if (token === undefined) throw new Error(`aucun e-mail d'invitation pour ${email}`);
  return token;
}

async function inviteUser(s: { workspace: { id: string }; owner: TestUser }, user: TestUser, role = 'editor'): Promise<string> {
  const res = await invite(call(`/workspaces/${s.workspace.id}/invitations`, s.owner.headers, { email: user.email, role }), ws(s.workspace.id));
  expect(res.status).toBe(201);
  return tokenSentTo(user.email);
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

describeRoute('inviteMember', {
  success: async () => {
    const email = `Nouveau-${randomUUID()}@Example.com`;
    const res = await invite(call(`/workspaces/${seeded.workspace.id}/invitations`, seeded.owner.headers, { email, role: 'viewer' }), ws(seeded.workspace.id));
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body).toMatchObject({ email: email.toLowerCase(), role: 'viewer' });
    expect(typeof body.id).toBe('string');
    // Valable 7 jours ; seul le hachage du jeton est en base.
    const days = (new Date(String(body.expires_at)).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    const token = tokenSentTo(email.toLowerCase());
    const { data } = await testServiceClient().from('invitations').select('token_hash').eq('id', String(body.id)).single();
    expect(data?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data?.token_hash).not.toContain(token);
    const mail = fakeOutbox.at(-1);
    expect(mail?.text).toContain(seeded.workspace.name);
  },
  unauthenticated: async () => {
    const res = await invite(call(`/workspaces/${seeded.workspace.id}/invitations`, { origin: APP }, { email: 'a@b.io', role: 'viewer' }), ws(seeded.workspace.id));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const email = `pirate-${randomUUID()}@example.com`;
    const res = await invite(call(`/workspaces/${id}/invitations`, seeded.owner.headers, { email, role: 'editor' }), ws(id));
    expect(res.status).toBe(404);
    const { data } = await testServiceClient().from('invitations').select('id').eq('email', email);
    expect(data).toEqual([]);
  },
  forbiddenRole: async () => {
    const res = await invite(call(`/workspaces/${seeded.workspace.id}/invitations`, seeded.editor.headers, { email: 'a@b.io', role: 'viewer' }), ws(seeded.workspace.id));
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const res = await invite(
      call(`/workspaces/${seeded.workspace.id}/invitations`, seeded.owner.headers, { email: 'pas-un-email', role: 'owner', workspace_id: randomUUID() }),
      ws(seeded.workspace.id),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email', code: 'invalid_format' }),
        expect.objectContaining({ field: 'role', code: 'invalid_value' }),
        expect.objectContaining({ field: 'workspace_id', code: 'unknown_field' }),
      ]),
    );
  },
  extra: {
    'EC-TEAM-01 : 409 quand la personne est déjà membre': async () => {
      const res = await invite(call(`/workspaces/${seeded.workspace.id}/invitations`, seeded.owner.headers, { email: seeded.editor.email.toUpperCase(), role: 'viewer' }), ws(seeded.workspace.id));
      expect(res.status).toBe(409);
      expect((await json(res)).code).toBe('conflict');
    },
    'limite de membres : sans formule (Starter, 1 membre), 402 member_limit_reached': async () => {
      const s = await seedWorkspace();
      const res = await invite(call(`/workspaces/${s.workspace.id}/invitations`, s.owner.headers, { email: `x-${randomUUID()}@example.com`, role: 'viewer' }), ws(s.workspace.id));
      expect(res.status).toBe(402);
      expect(await json(res)).toMatchObject({ code: 'member_limit_reached', meta: { members_limit: 1 } });
    },
    'limite de membres : les invitations en attente comptent ; réinviter la même adresse ne compte pas deux fois': async () => {
      // Business (5) : 3 membres + 2 invitations en attente = 5.
      const s = await seedWorkspace();
      await subscribe(s.workspace.id, 'business');
      const path = `/workspaces/${s.workspace.id}/invitations`;
      const first = `a-${randomUUID()}@example.com`;
      for (const email of [first, `b-${randomUUID()}@example.com`, first]) {
        expect((await invite(call(path, s.owner.headers, { email, role: 'viewer' }), ws(s.workspace.id))).status).toBe(201);
      }
      const { data } = await testServiceClient().from('invitations').select('id').eq('email', first);
      expect(data).toHaveLength(1);
      const full = await invite(call(path, s.owner.headers, { email: `c-${randomUUID()}@example.com`, role: 'viewer' }), ws(s.workspace.id));
      expect(full.status).toBe(402);
    },
    '403 workspace_read_only : espace en lecture seule': async () => {
      const s = await seedWorkspace({ status: 'read_only' });
      const res = await invite(call(`/workspaces/${s.workspace.id}/invitations`, s.owner.headers, { email: 'a@b.io', role: 'viewer' }), ws(s.workspace.id));
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_read_only');
    },
  },
});

describeRoute('acceptInvitation', {
  success: async () => {
    const team = await ownerWorkspace('business');
    const newcomer = await createTestUser({ label: 'newcomer' });
    const token = await inviteUser(team, newcomer, 'editor');
    const res = await accept(call('/invitations/accept', newcomer.headers, { token }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      id: team.workspace.id,
      role: 'editor',
      plan: 'business',
      quotas: { members: 2, members_limit: 5 },
    });
    expect(await roleOf(team.workspace.id, newcomer.id)).toBe('editor');
  },
  unauthenticated: async () => {
    const res = await accept(call('/invitations/accept', { origin: APP }, { token: 'a'.repeat(43) }));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    // Pas d'espace dans l'adresse : un jeton inconnu (ou d'un autre espace falsifié) → 404.
    const res = await accept(call('/invitations/accept', seeded.stranger.headers, { token: 'A'.repeat(43) }));
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('not_found');
  },
  forbiddenRole: async () => {
    // EC-TEAM-02 : jeton valide, mais compte connecté avec un autre e-mail que l'e-mail invité.
    const team = await ownerWorkspace('business');
    const invited = await createTestUser({ label: 'invited' });
    const token = await inviteUser(team, invited, 'viewer');
    const res = await accept(call('/invitations/accept', seeded.stranger.headers, { token }));
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('forbidden');
    expect(await roleOf(team.workspace.id, seeded.stranger.id)).toBeUndefined();
    // L'invitation reste utilisable par la bonne personne.
    expect((await accept(call('/invitations/accept', invited.headers, { token }))).status).toBe(200);
  },
  invalidBody: async () => {
    const res = await accept(call('/invitations/accept', seeded.stranger.headers, { token: 'court', extra: 1 }));
    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'token', code: 'too_short' }),
        expect.objectContaining({ field: 'extra', code: 'unknown_field' }),
      ]),
    );
  },
  extra: {
    'EC-TEAM-03 : 410 pour une invitation déjà utilisée': async () => {
      const team = await ownerWorkspace('business');
      const newcomer = await createTestUser({ label: 'twice' });
      const token = await inviteUser(team, newcomer, 'viewer');
      expect((await accept(call('/invitations/accept', newcomer.headers, { token }))).status).toBe(200);
      const again = await accept(call('/invitations/accept', newcomer.headers, { token }));
      expect(again.status).toBe(410);
      expect((await json(again)).code).toBe('gone');
    },
    'EC-TEAM-03 : 410 pour une invitation expirée ; une nouvelle invitation fonctionne': async () => {
      const team = await ownerWorkspace('business');
      const late = await createTestUser({ label: 'late' });
      const token = await inviteUser(team, late, 'viewer');
      await testServiceClient()
        .from('invitations')
        .update({ expires_at: '2026-01-01T00:00:00Z' })
        .eq('email', late.email);
      const res = await accept(call('/invitations/accept', late.headers, { token }));
      expect(res.status).toBe(410);
      const fresh = await inviteUser(team, late, 'viewer');
      expect((await accept(call('/invitations/accept', late.headers, { token: fresh }))).status).toBe(200);
    },
    'limite de membres : 402 à l’acceptation si l’espace s’est rempli entre-temps': async () => {
      // Pro (2 membres) : propriétaire + 1 invitation ; un membre est ajouté avant l'acceptation.
      const team = await ownerWorkspace('pro');
      const id = team.workspace.id;
      const invited = await createTestUser({ label: 'pro-invited' });
      const token = await inviteUser(team, invited, 'viewer');
      const other = await createTestUser({ label: 'pro-other' });
      await testServiceClient().from('workspace_members').insert({ workspace_id: id, profile_id: other.id, role: 'viewer' });
      const res = await accept(call('/invitations/accept', invited.headers, { token }));
      expect(res.status).toBe(402);
      expect((await json(res)).code).toBe('member_limit_reached');
      expect(await roleOf(id, invited.id)).toBeUndefined();
      // L'invitation n'est pas consommée : elle redevient utilisable si une place se libère.
      await testServiceClient().from('workspace_members').delete().eq('workspace_id', id).eq('profile_id', other.id);
      expect((await accept(call('/invitations/accept', invited.headers, { token }))).status).toBe(200);
    },
  },
});
