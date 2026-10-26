// Connexion Meta : démarrer, retour de Facebook, lister, déconnecter (APPFLOW §6.1, SECURITY_NOTES
// §2.3, EC-META-02). La vraie base est prouvée par les tests d'intégration des routes.
import { AppError } from '@pubeka/contracts';
import { FakeMetaConnector } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import type { Ctx } from '../context';
import { FakeClient } from '../fake-client.test-helper';
import {
  completeMetaConnect,
  disconnectMeta,
  getMetaConnection,
  listMetaConnections,
  startMetaConnect,
} from './connections';
import { createOAuthState, type ReturnTo } from './oauth-state';
import {
  CONN,
  NONCE,
  NOW,
  OWNER_ID,
  STARTER_PLAN,
  WS,
  codec,
  connectionRow,
  memberCtx,
  metaDeps,
  ok,
} from './meta.test-helper';

const stateFor = (over: { userId?: string; returnTo?: ReturnTo; now?: Date } = {}): string =>
  createOAuthState(codec, {
    userId: over.userId ?? OWNER_ID,
    workspaceId: WS,
    nonce: NONCE,
    returnTo: over.returnTo ?? 'settings',
    now: over.now ?? NOW,
  });

function plainCtx(db: FakeClient, svc: FakeClient): Ctx {
  const member = memberCtx(db, svc);
  return {
    requestId: member.requestId,
    user: member.user,
    db: member.db,
    svc: member.svc,
    now: member.now,
  };
}

describe('startMetaConnect', () => {
  it('renvoie l’adresse de Facebook avec un state lié à l’utilisateur et à l’espace', () => {
    const { authorize_url } = startMetaConnect(
      memberCtx(new FakeClient(), new FakeClient()),
      { return_to: 'onboarding' },
      metaDeps(),
    );
    const url = new URL(authorize_url);
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/api/v1/meta/callback');
    expect(JSON.parse(url.searchParams.get('state') ?? '{}')).toMatchObject({
      u: OWNER_ID,
      w: WS,
      n: NONCE,
      r: 'onboarding',
    });
  });

  it('revient aux réglages par défaut', () => {
    const { authorize_url } = startMetaConnect(
      memberCtx(new FakeClient(), new FakeClient()),
      {},
      metaDeps(),
    );
    expect(JSON.parse(new URL(authorize_url).searchParams.get('state') ?? '{}')).toMatchObject({
      r: 'settings',
    });
  });

  it.each(['editor', 'viewer'] as const)('refuse le rôle %s (propriétaire seulement)', (role) => {
    expect(() =>
      startMetaConnect(memberCtx(new FakeClient(), new FakeClient(), role), {}, metaDeps()),
    ).toThrow(expect.objectContaining({ code: 'role_insufficient' }));
  });

  it.each([
    ['read_only', 'workspace_read_only'],
    ['suspended', 'workspace_suspended'],
  ] as const)('refuse un espace %s', (access, code) => {
    expect(() =>
      startMetaConnect(
        memberCtx(new FakeClient(), new FakeClient(), 'owner', access),
        {},
        metaDeps(),
      ),
    ).toThrow(expect.objectContaining({ code }));
  });
});

describe('completeMetaConnect : refus avant tout appel à Meta', () => {
  const run = async (
    state: string,
    opts: {
      db?: FakeClient;
      svc?: FakeClient;
      code?: string | undefined;
      error?: string | undefined;
      connector?: FakeMetaConnector;
    } = {},
  ) => {
    const svc = opts.svc ?? new FakeClient().reply(ok(true), ok([]));
    const connector = opts.connector ?? new FakeMetaConnector();
    const result = await completeMetaConnect(
      plainCtx(opts.db ?? new FakeClient(), svc),
      { state, code: 'code' in opts ? opts.code : 'abc', error: opts.error },
      metaDeps(connector),
    );
    return { ...result, svc, connector };
  };

  it('state illisible ou mal signé → raison « state », rien n’est consommé', async () => {
    const r = await run('n-importe-quoi');
    expect(r.location).toBe('/reglages/comptes-meta?meta=error&reason=state');
    expect(r.svc.calls).toHaveLength(0);
  });

  it('state expiré → « state »', async () => {
    const r = await run(stateFor({ now: new Date(NOW.getTime() - 11 * 60_000) }));
    expect(r.location).toContain('reason=state');
    expect(r.svc.calls).toHaveLength(0);
  });

  it('state créé pour un autre utilisateur → « state », rien n’est consommé', async () => {
    const r = await run(
      stateFor({ userId: '99999999-9999-4999-8999-999999999999', returnTo: 'onboarding' }),
    );
    // Écran de retour par défaut : on ne fait pas confiance à un state qui n'est pas le nôtre.
    expect(r.location).toBe('/reglages/comptes-meta?meta=error&reason=state');
    expect(r.svc.calls).toHaveLength(0);
    expect(r.connector.lastRedirectUri).toBeNull();
  });

  it('state déjà utilisé (rejeu) → « state » sur l’écran d’origine', async () => {
    const svc = new FakeClient().reply(ok(false));
    const r = await run(stateFor({ returnTo: 'onboarding' }), { svc });
    expect(r.location).toBe('/bienvenue/meta?meta=error&reason=state');
    expect(r.svc.calls.map((c) => c.target)).toEqual(['rpc:record_webhook_event']);
    expect(r.connector.lastRedirectUri).toBeNull();
  });

  it('l’utilisateur n’est pas membre de cet espace → « forbidden »', async () => {
    const db = new FakeClient().reply(ok(null));
    const r = await run(stateFor(), { db });
    expect(r.location).toContain('reason=forbidden');
  });

  it('l’espace n’est pas lisible par l’utilisateur → « forbidden »', async () => {
    const db = new FakeClient().reply(ok({ role: 'owner' }), ok(null));
    expect((await run(stateFor(), { db })).location).toContain('reason=forbidden');
  });

  it.each([
    ['editor', 'active'],
    ['viewer', 'active'],
    ['owner', 'suspended'],
    ['owner', 'read_only'],
  ] as const)(
    'rôle %s dans un espace %s → « forbidden », aucun échange de code',
    async (role, status) => {
      const db = new FakeClient().reply(ok({ role }), ok({ status }));
      const r = await run(stateFor(), { db });
      expect(r.location).toContain('reason=forbidden');
      expect(r.connector.lastRedirectUri).toBeNull();
    },
  );

  it('l’utilisateur refuse ou ferme la fenêtre → « denied »', async () => {
    const db = new FakeClient().reply(ok({ role: 'owner' }), ok({ status: 'active' }));
    const r = await run(stateFor({ returnTo: 'onboarding' }), {
      db,
      code: undefined,
      error: 'access_denied',
    });
    expect(r.location).toBe('/bienvenue/meta?meta=error&reason=denied');
    expect(r.connector.lastRedirectUri).toBeNull();
  });

  it('retour sans code → « denied »', async () => {
    const db = new FakeClient().reply(ok({ role: 'owner' }), ok({ status: 'active' }));
    expect((await run(stateFor(), { db, code: '' })).location).toContain('reason=denied');
  });
});

describe('completeMetaConnect : connexion', () => {
  const memberDb = (): FakeClient =>
    new FakeClient().reply(ok({ role: 'owner' }), ok({ status: 'active' }));

  it('échange le code, chiffre le jeton, enregistre la connexion, les comptes et la Page', async () => {
    const connector = new FakeMetaConnector();
    const svc = new FakeClient().reply(
      ok(true), // state consommé
      ok([]), // abonnement (accès de l'espace)
      ok(CONN), // upsert_meta_connection
      ...STARTER_PLAN,
      ok(null), // upsert ad_accounts
      ok([{ id: 'a1', meta_ad_account_id: 'act_100000000001' }]), // comptes connus
      ok([]), // aucun compte actif
      ok({ id: 'a1' }), // le compte à activer
      ok(null), // set_active_ad_account
      ok(null), // upsert pages
      ok([{ id: 'p1', meta_page_id: '200000000001', active: false }]),
      ok('ok'), // set_page_active
    );
    const result = await completeMetaConnect(
      plainCtx(memberDb(), svc),
      { state: stateFor({ returnTo: 'onboarding' }), code: 'abc' },
      metaDeps(connector),
    );
    expect(result.location).toBe('/bienvenue/meta?meta=connected');
    expect(connector.lastRedirectUri).toBe('https://app.test/api/v1/meta/callback');

    const upsert = svc.calls.find((c) => c.target === 'rpc:upsert_meta_connection');
    const args = upsert?.ops.find((op) => op[0] === 'args')?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({ ws: WS, p_token_type: 'user', p_key_id: 'k1' });
    // Jamais le jeton en clair : le format scellé de packages/platforms.
    expect(String(args.p_sealed)).toMatch(/^v1\.k1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(svc.calls)).not.toContain('fake-token-abc');
    expect(args).not.toHaveProperty('p_expires_at');

    const activations = svc.calls.filter((c) => /set_(page|active_ad)/.test(c.target));
    expect(activations.map((c) => c.target)).toEqual([
      'rpc:set_active_ad_account',
      'rpc:set_page_active',
    ]);
    expect(activations[1]?.ops).toContainEqual([
      'args',
      { ws: WS, p_page: 'p1', want: true, max_pages: 1 },
    ]);
  });

  it('transmet la date d’expiration quand Meta en donne une', async () => {
    const connector = new FakeMetaConnector();
    connector.exchangeCode = (code, redirectUri) =>
      Promise.resolve({
        accessToken: `fake-token-${code}-${String(redirectUri.length)}`,
        expiresAt: new Date('2026-12-13T10:00:00Z'),
      });
    const svc = new FakeClient().reply(
      ok(true),
      ok([]), // abonnement
      ok(CONN),
      ...STARTER_PLAN,
      ok(null),
      ok([]),
      ok([{ id: 'a0' }, { id: 'a1' }]), // un compte est déjà actif : rien à choisir d'office
      ok(null),
      ok([]),
    );
    const result = await completeMetaConnect(
      plainCtx(memberDb(), svc),
      { state: stateFor(), code: 'abc' },
      metaDeps(connector),
    );
    expect(result.location).toBe('/reglages/comptes-meta?meta=connected');
    const upsert = svc.calls.find((c) => c.target === 'rpc:upsert_meta_connection');
    expect(upsert?.ops).toContainEqual([
      'args',
      expect.objectContaining({ p_expires_at: '2026-12-13T10:00:00.000Z' }),
    ]);
  });

  it.each(['meta_error', 'meta_token_expired', 'meta_payment_method_missing'] as const)(
    'une erreur de Meta (%s) devient « La connexion n’a pas abouti » (raison « meta »)',
    async (code) => {
      const connector = new FakeMetaConnector();
      connector.exchangeCode = () => Promise.reject(new AppError(code));
      const svc = new FakeClient().reply(ok(true), ok([]));
      const result = await completeMetaConnect(
        plainCtx(memberDb(), svc),
        { state: stateFor({ returnTo: 'onboarding' }), code: 'abc' },
        metaDeps(connector),
      );
      expect(result.location).toBe('/bienvenue/meta?meta=error&reason=meta');
      // Aucun jeton, aucune connexion enregistrés.
      expect(svc.calls.map((c) => c.target)).toEqual(['rpc:record_webhook_event', 'subscriptions']);
    },
  );

  it('une erreur qui ne vient pas de Meta n’est pas masquée (500)', async () => {
    const connector = new FakeMetaConnector();
    connector.exchangeCode = () => Promise.reject(new Error('panne de la base'));
    await expect(
      completeMetaConnect(
        plainCtx(memberDb(), new FakeClient().reply(ok(true), ok([]))),
        { state: stateFor(), code: 'abc' },
        metaDeps(connector),
      ),
    ).rejects.toThrow('panne de la base');
  });
});

describe('listMetaConnections / getMetaConnection', () => {
  it('liste les connexions de l’espace, sans jeton, avec le statut selon l’heure', async () => {
    const db = new FakeClient().reply(
      ok([
        {
          id: CONN,
          token_type: 'user',
          status: 'ok',
          expires_at: '2026-10-17T10:00:00.000Z',
          business_id: null,
          last_health_check: null,
        },
      ]),
    );
    const list = await listMetaConnections(memberCtx(db, new FakeClient(), 'viewer'));
    expect(list).toEqual([
      {
        id: CONN,
        token_type: 'user',
        status: 'expiring',
        expires_at: '2026-10-17T10:00:00.000Z',
        business_id: null,
        last_health_check: null,
      },
    ]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
  });

  it('une connexion absente ou d’un autre espace → not_found', async () => {
    const db = new FakeClient().reply(ok(null));
    await expect(getMetaConnection(memberCtx(db, new FakeClient()), CONN)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'id', CONN]);
  });
});

describe('disconnectMeta', () => {
  it('supprime la connexion (et son jeton par cascade) et désactive les Pages de l’espace', async () => {
    const db = new FakeClient().reply(connectionRow());
    const svc = new FakeClient().reply(ok(null), ok(null));
    await disconnectMeta(memberCtx(db, svc), CONN);
    expect(svc.calls.map((c) => c.target)).toEqual(['meta_connections', 'pages']);
    expect(svc.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(svc.calls[0]?.ops).toContainEqual(['eq', 'id', CONN]);
    expect(svc.calls[1]?.ops).toContainEqual(['update', { active: false }]);
    expect(svc.calls[1]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
  });

  it('refuse un éditeur, un lecteur, un espace en lecture seule, sans toucher à la base', async () => {
    for (const [role, access, code] of [
      ['editor', 'active', 'role_insufficient'],
      ['viewer', 'active', 'role_insufficient'],
      ['owner', 'read_only', 'workspace_read_only'],
    ] as const) {
      const svc = new FakeClient();
      await expect(
        disconnectMeta(memberCtx(new FakeClient(), svc, role, access), CONN),
      ).rejects.toMatchObject({ code });
      expect(svc.calls).toHaveLength(0);
    }
  });

  it('une connexion d’un autre espace → not_found, rien n’est supprimé', async () => {
    const svc = new FakeClient();
    await expect(
      disconnectMeta(memberCtx(new FakeClient().reply(ok(null)), svc), CONN),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(svc.calls).toHaveLength(0);
  });
});
