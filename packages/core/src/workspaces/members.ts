// Membres d'un espace : liste, changement de rôle, retrait (SECURITY_NOTES §2.2, §5.2).
// La table `workspace_members` est lisible par les membres (RLS) mais n'est modifiable que
// par le serveur (0001) : les écritures passent par le client service, toujours filtrées par
// l'espace de la requête, après les contrôles de rôle.
import { AppError } from '@pubeka/contracts';
import { check, unwrap, type ServiceClient } from '@pubeka/db';
import type { MemberCtx, MemberRole } from '../context';
import { assertRole, assertWritable } from './guards';

export interface Member {
  profile_id: string;
  email: string;
  name?: string;
  role: MemberRole;
  joined_at: string;
}

interface MemberRow {
  profile_id: string;
  role: MemberRole;
  joined_at: string;
}

/**
 * E-mail et nom des membres. Les profils ne sont lisibles que par leur titulaire (RLS) :
 * lecture par le service, limitée aux membres de l'espace (e-mails visibles par tous les
 * membres, SECURITY_NOTES §2.2 🔶).
 */
async function withProfiles(svc: ServiceClient, rows: readonly MemberRow[]): Promise<Member[]> {
  if (rows.length === 0) return [];
  const profiles = unwrap(
    await svc
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in(
        'id',
        rows.map((r) => r.profile_id),
      ),
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.flatMap((row) => {
    const profile = byId.get(row.profile_id);
    if (profile === undefined) return [];
    const name = [profile.first_name, profile.last_name]
      .filter((part): part is string => part !== null && part.trim() !== '')
      .join(' ');
    return [
      {
        profile_id: row.profile_id,
        email: profile.email,
        ...(name === '' ? {} : { name }),
        role: row.role,
        joined_at: row.joined_at,
      },
    ];
  });
}

/** Le propriétaire d'abord, puis par date d'arrivée. */
export async function listMembers(ctx: MemberCtx): Promise<Member[]> {
  const rows = unwrap(
    await ctx.db
      .from('workspace_members')
      .select('profile_id, role, joined_at')
      .eq('workspace_id', ctx.workspace.id)
      .order('joined_at', { ascending: true })
      .order('profile_id', { ascending: true }),
  );
  const owners = rows.filter((r) => r.role === 'owner');
  const others = rows.filter((r) => r.role !== 'owner');
  return withProfiles(ctx.svc, [...owners, ...others]);
}

/** Contrôles communs : propriétaire, espace modifiable, cible ≠ soi-même, cible membre. */
async function targetMember(ctx: MemberCtx, profileId: string): Promise<MemberRow> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  // EC-TEAM-05 : un espace a toujours exactement un propriétaire.
  if (profileId === ctx.user.id) throw new AppError('conflict');
  const row = unwrap<MemberRow | null>(
    await ctx.db
      .from('workspace_members')
      .select('profile_id, role, joined_at')
      .eq('workspace_id', ctx.workspace.id)
      .eq('profile_id', profileId)
      .maybeSingle(),
  );
  if (row === null) throw new AppError('not_found');
  if (row.role === 'owner') throw new AppError('conflict');
  return row;
}

export async function changeMemberRole(
  ctx: MemberCtx,
  profileId: string,
  role: 'editor' | 'viewer',
): Promise<Member> {
  await targetMember(ctx, profileId);
  const updated = unwrap(
    await ctx.svc
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', ctx.workspace.id)
      .eq('profile_id', profileId)
      .neq('role', 'owner')
      .select('profile_id, role, joined_at'),
  );
  const [member] = await withProfiles(ctx.svc, updated);
  if (member === undefined) throw new AppError('not_found');
  return member;
}

/** EC-TEAM-04 : le membre retiré reçoit 404 dès sa requête suivante (contrôle d'`api()`). */
export async function removeMember(ctx: MemberCtx, profileId: string): Promise<void> {
  await targetMember(ctx, profileId);
  check(
    await ctx.svc
      .from('workspace_members')
      .delete()
      .eq('workspace_id', ctx.workspace.id)
      .eq('profile_id', profileId)
      .neq('role', 'owner'),
  );
}
