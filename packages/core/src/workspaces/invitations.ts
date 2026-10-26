// Invitations d'équipe : POST {ws}/invitations et POST /invitations/accept
// (SECURITY_NOTES §2.2, EC-TEAM-01 à 03 ; SECURITE-BACKEND : seul le hachage du jeton est
// stocké, expiration obligatoire). `invitations` et `workspace_members` ne sont modifiables
// que par le serveur (0001) : écritures par le client service, toujours filtrées par l'espace.
//
// Limite de membres de la formule (plans-et-credits §1) : propriétaire, membres et invitations
// en attente comptent. Deux demandes simultanées pourraient passer le contrôle préalable :
// chaque écriture est donc suivie d'un recomptage, et annulée si la limite est dépassée.
import { AppError } from '@pubeka/contracts';
import { check, one, unwrap } from '@pubeka/db';
import type { Ctx, Locale, MemberCtx, MemberRole } from '../context';
import { loadWorkspaceAccess } from './access';
import { assertRole, assertWritable } from './guards';
import { countMembers, INVITATION_TTL_MS, memberLimitOf } from './plan-limits';
import { workspaceView, type Workspace } from './workspace-view';

export interface Invitation {
  id: string;
  email: string;
  role: 'editor' | 'viewer';
  expires_at: string;
}

/** Contenu de l'e-mail d'invitation ; le jeton n'apparaît que dans `acceptUrl`. */
export interface InvitationEmail {
  invitationId: string;
  to: string;
  locale: Locale;
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * Jeton d'invitation : créé et haché par l'appelant (`core` n'a pas accès à `node:crypto`).
 * Le jeton n'est jamais stocké ni journalisé ; seul son hachage est en base.
 */
export interface InvitationTokens {
  create: () => string;
  hash: (token: string) => string;
}

export interface InviteDeps {
  tokens: InvitationTokens;
  sendInvitationEmail: (email: InvitationEmail) => Promise<void>;
  /** Adresse de l'écran d'acceptation pour ce jeton. */
  acceptUrl: (token: string) => string;
}

function memberLimitReached(limit: number): AppError {
  return new AppError('member_limit_reached', { meta: { members_limit: limit } });
}

async function countPendingInvitations(ctx: MemberCtx): Promise<number> {
  const rows = unwrap(
    await ctx.svc
      .from('invitations')
      .select('id')
      .eq('workspace_id', ctx.workspace.id)
      .is('accepted_at', null)
      .gt('expires_at', ctx.now().toISOString()),
  );
  return rows.length;
}

async function inviterName(ctx: MemberCtx): Promise<string> {
  const profile = unwrap<{ first_name: string | null; last_name: string | null } | null>(
    await ctx.db
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', ctx.user.id)
      .maybeSingle(),
  );
  const name = [profile?.first_name, profile?.last_name]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  return name === '' ? ctx.user.email : name;
}

/** Inviter : propriétaire, espace modifiable, dans la limite de membres de la formule. */
export async function inviteMember(
  ctx: MemberCtx,
  input: { email: string; role: 'editor' | 'viewer' },
  deps: InviteDeps,
): Promise<Invitation> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  const email = input.email.trim().toLowerCase();
  const wsId = ctx.workspace.id;

  // EC-TEAM-01 : personne déjà membre → 409.
  const existing = unwrap(await ctx.svc.from('profiles').select('id').eq('email', email));
  if (existing.length > 0) {
    const members = unwrap(
      await ctx.svc
        .from('workspace_members')
        .select('profile_id')
        .eq('workspace_id', wsId)
        .in(
          'profile_id',
          existing.map((p) => p.id),
        ),
    );
    if (members.length > 0) throw new AppError('conflict');
  }

  // Une nouvelle invitation à la même adresse remplace celle qui n'a pas été acceptée.
  check(
    await ctx.svc
      .from('invitations')
      .delete()
      .eq('workspace_id', wsId)
      .eq('email', email)
      .is('accepted_at', null),
  );

  const limit = await memberLimitOf(ctx.svc, wsId);
  const seats = async (): Promise<number> =>
    (await countMembers(ctx.svc, wsId)) + (await countPendingInvitations(ctx));
  if ((await seats()) >= limit) throw memberLimitReached(limit);

  const token = deps.tokens.create();
  const expiresAt = new Date(ctx.now().getTime() + INVITATION_TTL_MS);
  const [created] = unwrap(
    await ctx.svc
      .from('invitations')
      .insert({
        workspace_id: wsId,
        email,
        role: input.role,
        token_hash: deps.tokens.hash(token),
        expires_at: expiresAt.toISOString(),
      })
      .select('id, email, role, expires_at'),
  );
  if (created === undefined) throw new AppError('internal_error');

  const cancel = async (): Promise<void> => {
    check(await ctx.svc.from('invitations').delete().eq('workspace_id', wsId).eq('id', created.id));
  };
  if ((await seats()) > limit) {
    await cancel();
    throw memberLimitReached(limit);
  }

  const workspace = one<{ name: string }>(
    await ctx.db.from('workspaces').select('name').eq('id', wsId).maybeSingle(),
  );
  try {
    await deps.sendInvitationEmail({
      invitationId: created.id,
      to: email,
      locale: ctx.user.locale,
      workspaceName: workspace.name,
      inviterName: await inviterName(ctx),
      acceptUrl: deps.acceptUrl(token),
      expiresAt,
    });
  } catch (err) {
    // E-mail non parti : l'invitation n'existe pas, le propriétaire peut réessayer.
    await cancel();
    throw new AppError('internal_error', { cause: err });
  }
  return {
    id: created.id,
    email: created.email,
    role: input.role,
    expires_at: created.expires_at,
  };
}

interface InvitationRow {
  id: string;
  workspace_id: string;
  email: string;
  role: MemberRole;
  expires_at: string;
  accepted_at: string | null;
}

/**
 * Accepter : la personne connectée avec l'e-mail invité (EC-TEAM-02), invitation ni expirée
 * ni utilisée (EC-TEAM-03), espace modifiable, dans la limite de membres de la formule.
 */
export async function acceptInvitation(
  ctx: Ctx,
  token: string,
  tokens: Pick<InvitationTokens, 'hash'>,
): Promise<Workspace> {
  const invitation = unwrap<InvitationRow | null>(
    await ctx.svc
      .from('invitations')
      .select('id, workspace_id, email, role, expires_at, accepted_at')
      .eq('token_hash', tokens.hash(token))
      .maybeSingle(),
  );
  if (invitation === null) throw new AppError('not_found');
  // L'e-mail est vérifié d'abord : un autre compte n'apprend rien de l'état de l'invitation.
  if (invitation.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
    throw new AppError('forbidden');
  }
  const now = ctx.now();
  if (invitation.accepted_at !== null || new Date(invitation.expires_at) <= now) {
    throw new AppError('gone');
  }
  const wsId = invitation.workspace_id;
  // La base refuse une invitation `owner` (0001) ; par prudence, jamais plus que lecteur.
  const role = invitation.role === 'owner' ? 'viewer' : invitation.role;

  // Accès réel (abonnement échu compris), lu avec le client service : l'invité n'est pas encore membre.
  const access = await loadWorkspaceAccess(ctx.svc, ctx.svc, wsId, now);
  if (access === null) throw new AppError('gone');
  if (access === 'suspended') throw new AppError('workspace_suspended');
  if (access === 'read_only') throw new AppError('workspace_read_only');

  const already = unwrap<{ role: MemberRole } | null>(
    await ctx.svc
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', wsId)
      .eq('profile_id', ctx.user.id)
      .maybeSingle(),
  );

  // Réservation de l'invitation : une seule acceptation, même en cas de double clic.
  const claimed = unwrap(
    await ctx.svc
      .from('invitations')
      .update({ accepted_at: now.toISOString() })
      .eq('id', invitation.id)
      .is('accepted_at', null)
      .gt('expires_at', now.toISOString())
      .select('id'),
  );
  if (claimed.length === 0) throw new AppError('gone');
  if (already !== null) return workspaceView(ctx, wsId, already.role);

  const release = async (): Promise<void> => {
    check(
      await ctx.svc
        .from('invitations')
        .update({ accepted_at: null })
        .eq('id', invitation.id)
        .eq('workspace_id', wsId),
    );
  };
  const limit = await memberLimitOf(ctx.svc, wsId);
  if ((await countMembers(ctx.svc, wsId)) >= limit) {
    await release();
    throw memberLimitReached(limit);
  }
  check(
    await ctx.svc
      .from('workspace_members')
      .insert({ workspace_id: wsId, profile_id: ctx.user.id, role }),
  );
  if ((await countMembers(ctx.svc, wsId)) > limit) {
    check(
      await ctx.svc
        .from('workspace_members')
        .delete()
        .eq('workspace_id', wsId)
        .eq('profile_id', ctx.user.id),
    );
    await release();
    throw memberLimitReached(limit);
  }
  return workspaceView(ctx, wsId, role);
}
