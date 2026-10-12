// Scénarios (TESTING §5.3) : un espace prêt à l'emploi, un administrateur. Chaque fichier de
// test crée ses propres espaces : aucune donnée partagée entre fichiers.
import pg from 'pg';
import type { Tables } from '@pubeka/db';
import { testEnv } from '../env';
import { createTestUser, testServiceClient, type TestUser } from '../factories/users';

type WorkspaceRow = Tables<'workspaces'>;

export interface SeededWorkspace {
  workspace: WorkspaceRow;
  owner: TestUser;
  editor: TestUser;
  viewer: TestUser;
  /** Membre d'un AUTRE espace : sert aux tests « 404 autre espace ». */
  stranger: TestUser;
  strangerWorkspace: WorkspaceRow;
}

export interface SeedWorkspaceOptions {
  /** État de l'espace (colonne `workspaces.status`). Grâce, formule et crédits : S19, S24. */
  status?: 'active' | 'read_only' | 'suspended';
}

async function ownWorkspace(user: TestUser): Promise<WorkspaceRow> {
  // L'inscription crée un espace dont l'utilisateur est propriétaire (déclencheur, E10).
  const { data, error } = await testServiceClient()
    .from('workspaces')
    .select('*')
    .eq('owner_id', user.id)
    .single();
  if (error !== null) throw new Error(`espace de ${user.email} : ${error.message}`);
  return data;
}

export async function seedWorkspace(opts: SeedWorkspaceOptions = {}): Promise<SeededWorkspace> {
  const svc = testServiceClient();
  const [owner, editor, viewer, stranger] = await Promise.all([
    createTestUser({ label: 'owner' }),
    createTestUser({ label: 'editor' }),
    createTestUser({ label: 'viewer' }),
    createTestUser({ label: 'stranger' }),
  ]);
  let workspace = await ownWorkspace(owner);
  const strangerWorkspace = await ownWorkspace(stranger);
  const members = await svc.from('workspace_members').insert([
    { workspace_id: workspace.id, profile_id: editor.id, role: 'editor', invited_by: owner.id },
    { workspace_id: workspace.id, profile_id: viewer.id, role: 'viewer', invited_by: owner.id },
  ]);
  if (members.error !== null) throw new Error(`membres : ${members.error.message}`);
  if (opts.status !== undefined && opts.status !== 'active') {
    const { data, error } = await svc
      .from('workspaces')
      .update({ status: opts.status })
      .eq('id', workspace.id)
      .select('*')
      .single();
    if (error !== null) throw new Error(`état de l'espace : ${error.message}`);
    workspace = data;
  }
  return { workspace, owner, editor, viewer, stranger, strangerWorkspace };
}

export interface SeedAdminOptions {
  aal?: 'aal1' | 'aal2';
  locked?: boolean;
}

/**
 * Administrateur de test : ligne dans `private.admin_users` (schéma non exposé par l'API,
 * écrite par une connexion directe à la base locale).
 * `aal2` exige l'enrôlement TOTP, désactivé dans supabase/config.toml jusqu'à S30.
 */
export async function seedAdmin(opts: SeedAdminOptions = {}): Promise<TestUser> {
  if (opts.aal === 'aal2') {
    throw new Error('seedAdmin({ aal: "aal2" }) : TOTP désactivé dans supabase/config.toml (S30)');
  }
  const user = await createTestUser({ label: 'admin' });
  const client = new pg.Client({ connectionString: testEnv().dbUrl });
  await client.connect();
  try {
    await client.query(
      'insert into private.admin_users (profile_id, locked_until) values ($1, $2)',
      [user.id, opts.locked === true ? new Date(Date.now() + 3_600_000) : null],
    );
  } finally {
    await client.end();
  }
  return user;
}

/** Active ou coupe le mode maintenance (`private.app_settings`, clé `maintenance`). */
export async function setMaintenance(active: boolean, message?: string): Promise<void> {
  const client = new pg.Client({ connectionString: testEnv().dbUrl });
  await client.connect();
  try {
    await client.query(
      `insert into private.app_settings (key, value) values ('maintenance', $1)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(message === undefined ? { active } : { active, message })],
    );
  } finally {
    await client.end();
  }
}

/** Lit la ligne d'administrateur (vérification des scénarios). */
export async function readAdminRow(
  profileId: string,
): Promise<{ profile_id: string; locked_until: Date | null } | undefined> {
  const client = new pg.Client({ connectionString: testEnv().dbUrl });
  await client.connect();
  try {
    const res = await client.query<{ profile_id: string; locked_until: Date | null }>(
      'select profile_id, locked_until from private.admin_users where profile_id = $1',
      [profileId],
    );
    return res.rows[0];
  } finally {
    await client.end();
  }
}
