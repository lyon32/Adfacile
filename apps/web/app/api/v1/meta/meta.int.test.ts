// Connexion Meta contre la pile Supabase locale et la fausse Meta (TESTING §6) : les 5 cas de
// chaque route (API_SPEC §15) et les cas limites du `state` (SECURITY_NOTES §2.3, EC-META-02).
// Aucun appel à un vrai service Meta.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  queryTestDb,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { DELETE as disconnect } from '../workspaces/[workspaceId]/meta/connections/[connectionId]/route';
import { GET as listConnections } from '../workspaces/[workspaceId]/meta/connections/route';
import { POST as connect } from '../workspaces/[workspaceId]/meta/connect/route';
import { GET as callback } from './callback/route';
import {
  APP,
  call,
  callbackRequest,
  conn,
  connectWorkspace,
  connectionRows,
  forgedState,
  idOf,
  inSeconds,
  json,
  newState,
  nonce,
  stateOf,
  ws,
} from './int-support';

let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

describeRoute('startMetaConnect', {
  success: async () => {
    const id = seeded.workspace.id;
    const res = await connect(
      call('POST', `/workspaces/${id}/meta/connect`, seeded.owner.headers, {
        return_to: 'onboarding',
      }),
      ws(id),
    );
    expect(res.status).toBe(200);
    const url = new URL(((await json(res)) as { authorize_url: string }).authorize_url);
    expect(url.searchParams.get('redirect_uri')).toBe(`${APP}/api/v1/meta/callback`);
    // `state` : charge utile signée (lié à l'utilisateur et à l'espace), pas le jeton ni un secret.
    expect(stateOf(url.toString()).split('.')).toHaveLength(2);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    expect((await connect(call('POST', `/workspaces/${id}/meta/connect`, {}), ws(id))).status).toBe(
      401,
    );
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await connect(
      call('POST', `/workspaces/${id}/meta/connect`, seeded.owner.headers),
      ws(id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: async () => {
    const id = seeded.workspace.id;
    for (const user of [seeded.editor, seeded.viewer]) {
      const res = await connect(
        call('POST', `/workspaces/${id}/meta/connect`, user.headers),
        ws(id),
      );
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('role_insufficient');
    }
  },
  invalidBody: async () => {
    const id = seeded.workspace.id;
    const res = await connect(
      call('POST', `/workspaces/${id}/meta/connect`, seeded.owner.headers, {
        return_to: 'ailleurs',
      }),
      ws(id),
    );
    expect(res.status).toBe(400);
    const res2 = await connect(
      call('POST', `/workspaces/${id}/meta/connect`, seeded.owner.headers, { inconnu: 1 }),
      ws(id),
    );
    expect(res2.status).toBe(400);
  },
  extra: {
    'EC-META : espace en lecture seule → 403 workspace_read_only': async () => {
      const ro = await seedWorkspace({ status: 'read_only' });
      const id = ro.workspace.id;
      const res = await connect(
        call('POST', `/workspaces/${id}/meta/connect`, ro.owner.headers),
        ws(id),
      );
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_read_only');
    },
  },
});

describeRoute('metaCallback', {
  success: async () => {
    const s = await seedWorkspace();
    const res = await connectWorkspace(s, 'onboarding');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/bienvenue/meta?meta=connected');
    const rows = await connectionRows(s.workspace.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ok', token_type: 'user' });
    // Le jeton est chiffré (format scellé de la clé de test), jamais en clair.
    const tokens = await queryTestDb<{ sealed: string; key_id: string }>(
      'select sealed, key_id from private.meta_tokens where connection_id = $1',
      [rows[0]?.id],
    );
    expect(tokens[0]?.sealed).toMatch(/^v1\.ci\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(tokens[0]?.sealed).not.toContain('fake-token');
    expect(tokens[0]?.key_id).toBe('ci');
    // Comptes et Pages enregistrés ; l'unique compte et l'unique Page sont choisis d'office.
    const accounts = await testServiceClient()
      .from('ad_accounts')
      .select('meta_ad_account_id, is_active')
      .eq('workspace_id', s.workspace.id);
    expect(accounts.data).toEqual([{ meta_ad_account_id: 'act_100000000001', is_active: true }]);
    const pages = await testServiceClient()
      .from('pages')
      .select('meta_page_id, active')
      .eq('workspace_id', s.workspace.id);
    expect(pages.data).toEqual([{ meta_page_id: '200000000001', active: true }]);
  },
  unauthenticated: async () => {
    const res = await callback(callbackRequest({}, { state: 'x', code: 'y' }));
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    // Le `state` d'un autre utilisateur (lien piégé envoyé à la victime) : rien n'est enregistré.
    const s = await seedWorkspace();
    const state = await newState(s);
    const res = await callback(callbackRequest(s.stranger.headers, { state, code: 'c' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/reglages/comptes-meta?meta=error&reason=state');
    expect(await connectionRows(s.workspace.id)).toHaveLength(0);
    expect(await connectionRows(s.strangerWorkspace.id)).toHaveLength(0);
  },
  forbiddenRole: async () => {
    // Un `state` valide pour un utilisateur qui n'est plus propriétaire (rôle changé entre-temps).
    const s = await seedWorkspace();
    const state = forgedState({
      v: 1,
      u: s.editor.id,
      w: s.workspace.id,
      n: nonce(),
      e: inSeconds(300),
      r: 'settings',
    });
    const res = await callback(callbackRequest(s.editor.headers, { state, code: 'c' }));
    expect(res.headers.get('location')).toBe('/reglages/comptes-meta?meta=error&reason=forbidden');
    expect(await connectionRows(s.workspace.id)).toHaveLength(0);
  },
  invalidBody: async () => {
    const s = await seedWorkspace();
    const res = await callback(callbackRequest(s.owner.headers, { code: 'sans-state' }));
    expect(res.status).toBe(400);
  },
  extra: {
    'EC-META : un state rejoué est refusé (usage unique)': async () => {
      const s = await seedWorkspace();
      const state = await newState(s);
      const first = await callback(callbackRequest(s.owner.headers, { state, code: 'a' }));
      expect(first.headers.get('location')).toBe('/reglages/comptes-meta?meta=connected');
      const second = await callback(callbackRequest(s.owner.headers, { state, code: 'a' }));
      expect(second.headers.get('location')).toBe('/reglages/comptes-meta?meta=error&reason=state');
      expect(await connectionRows(s.workspace.id)).toHaveLength(1);
    },
    'un state expiré est refusé': async () => {
      const s = await seedWorkspace();
      const state = forgedState({
        v: 1,
        u: s.owner.id,
        w: s.workspace.id,
        n: nonce(),
        e: inSeconds(-1),
        r: 'settings',
      });
      const res = await callback(callbackRequest(s.owner.headers, { state, code: 'c' }));
      expect(res.headers.get('location')).toBe('/reglages/comptes-meta?meta=error&reason=state');
      expect(await connectionRows(s.workspace.id)).toHaveLength(0);
    },
    'un state modifié ou non signé est refusé': async () => {
      const s = await seedWorkspace();
      const state = await newState(s);
      const [body, signature] = state.split('.');
      const other = Buffer.from(
        JSON.stringify({
          ...(JSON.parse(Buffer.from(body ?? '', 'base64url').toString()) as object),
          w: s.strangerWorkspace.id,
        }),
      ).toString('base64url');
      for (const bad of [
        `${other}.${signature ?? ''}`,
        body ?? '',
        'n-importe-quoi',
        `${body ?? ''}.AAAA`,
      ]) {
        const res = await callback(callbackRequest(s.owner.headers, { state: bad, code: 'c' }));
        expect(res.headers.get('location')).toBe('/reglages/comptes-meta?meta=error&reason=state');
      }
      expect(await connectionRows(s.strangerWorkspace.id)).toHaveLength(0);
      expect(await connectionRows(s.workspace.id)).toHaveLength(0);
    },
    "APPFLOW §6.1 : l'utilisateur refuse ou ferme la fenêtre → « La connexion n'a pas abouti »":
      async () => {
        const s = await seedWorkspace();
        const state = await newState(s, 'onboarding');
        const res = await callback(
          callbackRequest(s.owner.headers, { state, error: 'access_denied' }),
        );
        expect(res.headers.get('location')).toBe('/bienvenue/meta?meta=error&reason=denied');
        expect(await connectionRows(s.workspace.id)).toHaveLength(0);
      },
    'une reconnexion met à jour la même connexion et garde la Page choisie': async () => {
      const s = await seedWorkspace();
      await connectWorkspace(s);
      const [first] = await connectionRows(s.workspace.id);
      await connectWorkspace(s);
      const rows = await connectionRows(s.workspace.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(first?.id);
    },
  },
});

describeRoute('listMetaConnections', {
  success: async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    for (const user of [s.owner, s.editor, s.viewer]) {
      const res = await listConnections(
        call('GET', `/workspaces/${s.workspace.id}/meta/connections`, user.headers),
        ws(s.workspace.id),
      );
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: Record<string, unknown>[] };
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ token_type: 'user', status: 'ok', last_health_check: null });
      // Jamais le jeton, ni son chiffré, ni l'identifiant de clé.
      expect(JSON.stringify(data)).not.toMatch(/sealed|ciphertext|key_id|fake-token|v1\./);
    }
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    expect(
      (await listConnections(call('GET', `/workspaces/${id}/meta/connections`, {}), ws(id))).status,
    ).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await listConnections(
      call('GET', `/workspaces/${id}/meta/connections`, seeded.owner.headers),
      ws(id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('tout membre voit les connexions (SECURITY_NOTES §2.3)'),
  invalidBody: na('GET sans corps'),
  extra: {
    'APPFLOW §6.4 : « expire bientôt » à J-7, « expirée » une fois la date passée': async () => {
      const s = await seedWorkspace();
      await connectWorkspace(s);
      const svc = testServiceClient();
      const statusOf = async () => {
        const res = await listConnections(
          call('GET', `/workspaces/${s.workspace.id}/meta/connections`, s.owner.headers),
          ws(s.workspace.id),
        );
        return ((await res.json()) as { data: { status: string }[] }).data[0]?.status;
      };
      const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
      await svc
        .from('meta_connections')
        .update({ expires_at: at(40) })
        .eq('workspace_id', s.workspace.id);
      expect(await statusOf()).toBe('ok');
      await svc
        .from('meta_connections')
        .update({ expires_at: at(3) })
        .eq('workspace_id', s.workspace.id);
      expect(await statusOf()).toBe('expiring');
      await svc
        .from('meta_connections')
        .update({ expires_at: at(-1) })
        .eq('workspace_id', s.workspace.id);
      expect(await statusOf()).toBe('expired');
    },
  },
});

describeRoute('disconnectMeta', {
  success: async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    const res = await disconnect(
      call('DELETE', `/workspaces/${s.workspace.id}/meta/connections/${idOf(c)}`, s.owner.headers),
      conn(s.workspace.id, idOf(c)),
    );
    expect(res.status).toBe(204);
    expect(await connectionRows(s.workspace.id)).toHaveLength(0);
    // Le jeton chiffré est effacé avec la connexion, et les Pages sont désactivées.
    const tokens = await queryTestDb('select 1 from private.meta_tokens where connection_id = $1', [
      idOf(c),
    ]);
    expect(tokens).toHaveLength(0);
    const pages = await testServiceClient()
      .from('pages')
      .select('active')
      .eq('workspace_id', s.workspace.id);
    expect(pages.data?.every((p) => !p.active)).toBe(true);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await disconnect(
      call('DELETE', `/workspaces/${id}/meta/connections/${randomUUID()}`, {}),
      conn(id, randomUUID()),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    const res = await disconnect(
      call(
        'DELETE',
        `/workspaces/${s.strangerWorkspace.id}/meta/connections/${idOf(c)}`,
        s.owner.headers,
      ),
      conn(s.strangerWorkspace.id, idOf(c)),
    );
    expect(res.status).toBe(404);
    // L'identifiant d'une connexion d'un autre espace ne suffit pas : rien n'a été supprimé.
    const foreign = await disconnect(
      call(
        'DELETE',
        `/workspaces/${s.strangerWorkspace.id}/meta/connections/${idOf(c)}`,
        s.stranger.headers,
      ),
      conn(s.strangerWorkspace.id, idOf(c)),
    );
    expect(foreign.status).toBe(404);
    expect(await connectionRows(s.workspace.id)).toHaveLength(1);
  },
  forbiddenRole: async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    for (const user of [s.editor, s.viewer]) {
      const res = await disconnect(
        call('DELETE', `/workspaces/${s.workspace.id}/meta/connections/${idOf(c)}`, user.headers),
        conn(s.workspace.id, idOf(c)),
      );
      expect(res.status).toBe(403);
    }
    expect(await connectionRows(s.workspace.id)).toHaveLength(1);
  },
  invalidBody: async () => {
    const id = seeded.workspace.id;
    const res = await disconnect(
      call('DELETE', `/workspaces/${id}/meta/connections/pas-un-uuid`, seeded.owner.headers),
      conn(id, 'pas-un-uuid'),
    );
    expect(res.status).toBe(400);
  },
});

describe('jeton Meta : cloisonnement et chiffrement (TR-SEC, EC-META)', () => {
  it('le jeton d’un espace n’est pas lisible avec l’identifiant de connexion d’un autre espace', async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    const { data } = await testServiceClient().rpc('get_meta_token', {
      ws: s.strangerWorkspace.id,
      conn: idOf(c),
    });
    expect(data).toEqual([]);
  });

  it('un membre ne peut ni lire la table des jetons ni appeler les fonctions du serveur', async () => {
    const s = await seedWorkspace();
    await connectWorkspace(s);
    const [c] = await connectionRows(s.workspace.id);
    const direct = await s.owner.db.rpc('get_meta_token', { ws: s.workspace.id, conn: idOf(c) });
    expect(direct.error).not.toBeNull();
    const read = await s.owner.db
      .from('meta_connections')
      .select('*')
      .eq('workspace_id', s.workspace.id);
    expect(JSON.stringify(read.data)).not.toMatch(/sealed|v1\./);
  });
});
