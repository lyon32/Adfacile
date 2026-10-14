// Bilan de santé d'une connexion (F1) : lecture chez Meta, mise à jour des comptes et des Pages,
// enregistrement du bilan, jeton expiré (EC-META-01).
import { AppError } from '@pubeka/contracts';
import { FakeMetaConnector } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { runMetaHealthCheck } from './health';
import {
  CONN,
  NOW,
  STARTER_PLAN,
  WS,
  connectionRow,
  memberCtx,
  metaDeps,
  ok,
  sealedRow,
} from './meta.test-helper';

const ACCOUNT_ROWS = ok([{ id: 'a1', meta_ad_account_id: 'act_100000000001', is_active: true }]);
const PAGE_ROWS = ok([{ id: 'p1', meta_page_id: '200000000001', active: true }]);

/** Ce que `runMetaHealthCheck` demande à la base, dans l'ordre, quand tout va bien. */
function happySvc(): FakeClient {
  return new FakeClient().reply(
    sealedRow(),
    ...STARTER_PLAN,
    ok(null), // upsert comptes
    ok([{ id: 'a1', meta_ad_account_id: 'act_100000000001' }]),
    ok([{ id: 'a1' }]), // un compte est déjà actif
    ok(null), // upsert Pages
    ok([{ id: 'p1', meta_page_id: '200000000001', active: true }]),
    ACCOUNT_ROWS,
    PAGE_ROWS,
    ok(null), // compte : moyen de paiement
    ok(null), // Page : Instagram, WhatsApp
    ok(null), // bilan enregistré
  );
}

describe('runMetaHealthCheck', () => {
  it('relit les comptes et les Pages, contrôle le compte et la Page actifs, enregistre le bilan', async () => {
    const connector = new FakeMetaConnector();
    const svc = happySvc();
    const result = await runMetaHealthCheck(
      memberCtx(new FakeClient().reply(connectionRow()), svc),
      CONN,
      metaDeps(connector),
    );
    expect(result.checked_at).toBe(NOW.toISOString());
    expect(result.items.map((i) => [i.key, i.ok])).toEqual([
      ['business_portfolio', true],
      ['ad_account', true],
      ['payment_method', true],
      ['page', true],
      ['instagram', true],
      ['whatsapp', true],
      ['pixel', true],
      ['permissions', true],
    ]);
    expect(connector.lastHealthTarget).toEqual({
      adAccountId: 'act_100000000001',
      pageId: '200000000001',
    });
    const writes = svc.calls.filter((c) => c.ops.some((op) => op[0] === 'update'));
    expect(writes.map((c) => c.target)).toEqual(['ad_accounts', 'pages', 'meta_connections']);
    expect(writes[0]?.ops).toContainEqual(['update', { has_payment_method: true }]);
    expect(writes[1]?.ops).toContainEqual([
      'update',
      { instagram_account_id: null, whatsapp_linked: true },
    ]);
    expect(writes[2]?.ops).toContainEqual([
      'update',
      {
        last_health_check: {
          checked_at: NOW.toISOString(),
          items: expect.arrayContaining([
            { key: 'ad_account', ok: true, required: true },
          ]) as unknown,
        },
      },
    ]);
    // Toujours filtré par espace, même avec le client service.
    expect(
      writes.every((c) =>
        c.ops.some((op) => op[0] === 'eq' && op[1] === 'workspace_id' && op[2] === WS),
      ),
    ).toBe(true);
  });

  it('retient l’identifiant Instagram renvoyé par Meta quand il est valide', async () => {
    const connector = new FakeMetaConnector();
    connector.healthCheck = () =>
      Promise.resolve([
        { key: 'ad_account', status: 'ok' },
        { key: 'payment_method', status: 'missing' },
        { key: 'page', status: 'ok' },
        { key: 'instagram', status: 'ok', detail: { id: '300000000001' } },
        { key: 'whatsapp', status: 'missing' },
        { key: 'pixel', status: 'warning' },
        { key: 'permissions', status: 'warning' },
      ]);
    const svc = happySvc();
    const result = await runMetaHealthCheck(
      memberCtx(new FakeClient().reply(connectionRow()), svc),
      CONN,
      metaDeps(connector),
    );
    expect(result.items.filter((i) => !i.ok).map((i) => i.key)).toEqual([
      'payment_method',
      'whatsapp',
      'pixel',
      'permissions',
    ]);
    const pages = svc.calls.find(
      (c) => c.target === 'pages' && c.ops.some((op) => op[0] === 'update'),
    );
    expect(pages?.ops).toContainEqual([
      'update',
      { instagram_account_id: '300000000001', whatsapp_linked: false },
    ]);
    const account = svc.calls.find(
      (c) => c.target === 'ad_accounts' && c.ops.some((op) => op[0] === 'update'),
    );
    expect(account?.ops).toContainEqual(['update', { has_payment_method: false }]);
  });

  it('sans compte publicitaire ni Page : bilan rouge, aucun contrôle auprès de Meta', async () => {
    const connector = new FakeMetaConnector();
    connector.listAdAccounts = () => Promise.resolve([]);
    connector.listPages = () => Promise.resolve([]);
    const svc = new FakeClient().reply(
      sealedRow(),
      ...STARTER_PLAN,
      ok([]), // comptes connus
      ok([]), // aucun actif
      ok([]), // Pages connues
      ok([]), // comptes enregistrés
      ok([]), // Pages enregistrées
      ok(null), // bilan
    );
    const result = await runMetaHealthCheck(
      memberCtx(new FakeClient().reply(connectionRow()), svc),
      CONN,
      metaDeps(connector),
    );
    expect(connector.lastHealthTarget).toBeNull();
    expect(result.items.filter((i) => i.ok)).toEqual([]);
    expect(result.items.find((i) => i.key === 'ad_account')).toMatchObject({
      required: true,
      guide_slug: 'ad-account',
    });
  });

  it('EC-META-01 : jeton refusé par Meta → connexion marquée « expired », erreur 424', async () => {
    const connector = new FakeMetaConnector();
    connector.listPages = () => Promise.reject(new AppError('meta_token_expired'));
    const svc = new FakeClient().reply(sealedRow(), ok(null));
    await expect(
      runMetaHealthCheck(
        memberCtx(new FakeClient().reply(connectionRow()), svc),
        CONN,
        metaDeps(connector),
      ),
    ).rejects.toMatchObject({ code: 'meta_token_expired' });
    const update = svc.calls.find((c) => c.target === 'meta_connections');
    expect(update?.ops).toContainEqual(['update', { status: 'expired' }]);
  });

  it('une panne de Meta (502) est renvoyée telle quelle, sans marquer la connexion expirée', async () => {
    const connector = new FakeMetaConnector();
    connector.listAdAccounts = () => Promise.reject(new AppError('meta_error'));
    const svc = new FakeClient().reply(sealedRow());
    await expect(
      runMetaHealthCheck(
        memberCtx(new FakeClient().reply(connectionRow()), svc),
        CONN,
        metaDeps(connector),
      ),
    ).rejects.toMatchObject({ code: 'meta_error' });
    expect(svc.calls.some((c) => c.target === 'meta_connections')).toBe(false);
  });

  it('une connexion déjà expirée (date passée) → 424 sans appeler Meta, statut enregistré', async () => {
    const connector = new FakeMetaConnector();
    const svc = new FakeClient().reply(ok(null));
    await expect(
      runMetaHealthCheck(
        memberCtx(
          new FakeClient().reply(connectionRow({ expires_at: '2026-10-01T00:00:00.000Z' })),
          svc,
        ),
        CONN,
        metaDeps(connector),
      ),
    ).rejects.toMatchObject({ code: 'meta_token_expired' });
    expect(svc.calls.map((c) => c.target)).toEqual(['meta_connections']);
  });

  it('une connexion révoquée → 424 sans rien écrire', async () => {
    const svc = new FakeClient();
    await expect(
      runMetaHealthCheck(
        memberCtx(new FakeClient().reply(connectionRow({ status: 'revoked' })), svc),
        CONN,
        metaDeps(),
      ),
    ).rejects.toMatchObject({ code: 'meta_token_expired' });
    expect(svc.calls).toHaveLength(0);
  });

  it('jeton introuvable pour cette connexion → not_found', async () => {
    const svc = new FakeClient().reply(ok([]));
    await expect(
      runMetaHealthCheck(memberCtx(new FakeClient().reply(connectionRow()), svc), CONN, metaDeps()),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it.each([
    ['editor', 'active', 'role_insufficient'],
    ['viewer', 'active', 'role_insufficient'],
    ['owner', 'read_only', 'workspace_read_only'],
    ['owner', 'suspended', 'workspace_suspended'],
  ] as const)('refuse %s dans un espace %s', async (role, access, code) => {
    const db = new FakeClient();
    await expect(
      runMetaHealthCheck(memberCtx(db, new FakeClient(), role, access), CONN, metaDeps()),
    ).rejects.toMatchObject({ code });
    expect(db.calls).toHaveLength(0);
  });
});
