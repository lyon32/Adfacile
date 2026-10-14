// Enregistrement des comptes publicitaires et des Pages renvoyés par Meta (APPFLOW §6.2,
// EC-META-03) : relançable, sans écraser les choix du client.
import type { PlatformAdAccount, PlatformPage } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { syncMetaAssets } from './sync';
import { CONN, WS, ok } from './meta.test-helper';

const account = (n: number, over: Partial<PlatformAdAccount> = {}): PlatformAdAccount => ({
  id: `act_10000000000${String(n)}`,
  name: `Compte ${String(n)}`,
  statusCode: 1,
  statusLabel: 'Actif',
  usable: true,
  currency: 'USD',
  timezone: 'Africa/Douala',
  pixelsCount: null,
  ...over,
});
const page = (n: number): PlatformPage => ({
  id: `20000000000${String(n)}`,
  name: `Page ${String(n)}`,
  category: null,
});
const input = (accounts: PlatformAdAccount[], pages: PlatformPage[], maxPages = 1) => ({
  workspaceId: WS,
  connectionId: CONN,
  accounts,
  pages,
  maxPages,
});
const targets = (svc: FakeClient): string[] => svc.calls.map((c) => c.target);

describe('syncMetaAssets : comptes publicitaires', () => {
  it('enregistre par identifiant Meta, sans fournir is_active (le choix du client est gardé)', async () => {
    const svc = new FakeClient().reply(
      ok(null),
      ok([]),
      ok([{ id: 'x' }]), // déjà un compte actif
      ok([]), // Pages connues
    );
    await syncMetaAssets(svc.asService(), input([account(1), account(2)], []));
    const upsert = svc.calls[0];
    expect(upsert?.target).toBe('ad_accounts');
    const [, rows, options] = upsert?.ops.find((op) => op[0] === 'upsert') ?? [];
    expect(options).toEqual({ onConflict: 'workspace_id,meta_ad_account_id' });
    expect(rows).toEqual([
      {
        workspace_id: WS,
        meta_connection_id: CONN,
        meta_ad_account_id: 'act_100000000001',
        name: 'Compte 1',
        currency: 'USD',
      },
      expect.objectContaining({ meta_ad_account_id: 'act_100000000002' }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('is_active');
    expect(targets(svc)).not.toContain('rpc:set_active_ad_account');
  });

  it('écarte un identifiant invalide et une monnaie qui n’a pas 3 lettres majuscules', async () => {
    const svc = new FakeClient().reply(ok(null), ok([]), ok([{ id: 'x' }]), ok([]));
    await syncMetaAssets(
      svc.asService(),
      input(
        [account(1, { currency: 'usd' }), account(2, { id: 'act_12' }), account(3, { id: 'x' })],
        [],
      ),
    );
    const [, rows] = svc.calls[0]?.ops.find((op) => op[0] === 'upsert') ?? [];
    expect(rows).toEqual([
      expect.objectContaining({ meta_ad_account_id: 'act_100000000001', currency: null }),
    ]);
  });

  it('choisit d’office le seul compte utilisable quand aucun n’est actif', async () => {
    const svc = new FakeClient().reply(
      ok(null),
      ok([]),
      ok([]), // aucun actif
      ok({ id: 'a2' }),
      ok(null),
      ok([]),
    );
    await syncMetaAssets(
      svc.asService(),
      input([account(1, { usable: false, statusLabel: 'Désactivé' }), account(2)], []),
    );
    const rpc = svc.calls.find((c) => c.target === 'rpc:set_active_ad_account');
    expect(rpc?.ops).toContainEqual(['args', { ws: WS, p_id: 'a2' }]);
  });

  it('ne choisit rien d’office quand plusieurs comptes sont utilisables', async () => {
    const svc = new FakeClient().reply(ok(null), ok([]), ok([]), ok([]));
    await syncMetaAssets(svc.asService(), input([account(1), account(2)], []));
    expect(targets(svc)).not.toContain('rpc:set_active_ad_account');
  });

  it('supprime un compte disparu qui ne sert à aucune campagne, désactive celui qui en a', async () => {
    const svc = new FakeClient().reply(
      ok(null),
      ok([
        { id: 'keep', meta_ad_account_id: 'act_100000000001' },
        { id: 'gone', meta_ad_account_id: 'act_100000000002' },
        { id: 'used', meta_ad_account_id: 'act_100000000003' },
      ]),
      ok([{ ad_account_id: 'used' }]), // campagnes qui s'en servent
      ok(null), // suppression
      ok(null), // désactivation
      ok([{ id: 'keep' }]),
      ok([]),
    );
    await syncMetaAssets(svc.asService(), input([account(1)], []));
    const del = svc.calls.find((c) => c.ops.some((op) => op[0] === 'delete'));
    expect(del?.ops).toContainEqual(['in', 'id', ['gone']]);
    expect(del?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    const deactivate = svc.calls.find((c) => c.ops.some((op) => op[0] === 'update'));
    expect(deactivate?.ops).toContainEqual(['update', { is_active: false }]);
    expect(deactivate?.ops).toContainEqual(['in', 'id', ['used']]);
  });

  it('désactive sans supprimer un compte disparu qui sert encore à une campagne', async () => {
    const svc = new FakeClient().reply(
      ok(null),
      ok([{ id: 'used', meta_ad_account_id: 'act_100000000009' }]),
      ok([{ ad_account_id: 'used' }]),
      ok(null),
      ok([{ id: 'z' }]),
      ok([]),
    );
    await syncMetaAssets(svc.asService(), input([account(1)], []));
    expect(svc.calls.some((c) => c.ops.some((op) => op[0] === 'delete'))).toBe(false);
  });

  it('sans compte renvoyé par Meta, rien n’est écrit pour les comptes et tout compte connu est écarté', async () => {
    const svc = new FakeClient().reply(
      ok([{ id: 'old', meta_ad_account_id: 'act_100000000001' }]),
      ok([]),
      ok(null),
      ok([]),
      ok([]),
    );
    await syncMetaAssets(svc.asService(), input([], []));
    expect(svc.calls[0]?.ops.some((op) => op[0] === 'upsert')).toBe(false);
  });
});

describe('syncMetaAssets : Pages', () => {
  const noAccounts = (): FakeClient => new FakeClient().reply(ok([]), ok([{ id: 'x' }]));

  it('enregistre les Pages par identifiant Meta sans toucher à active, à la langue ni au ton', async () => {
    const svc = noAccounts().reply(
      ok(null),
      ok([
        { id: 'p1', meta_page_id: '200000000001', active: true },
        { id: 'p2', meta_page_id: '200000000002', active: false },
      ]),
    );
    await syncMetaAssets(svc.asService(), input([], [page(1), page(2)], 3));
    const pages = svc.calls.filter((c) => c.target === 'pages');
    const [, rows, options] = pages[0]?.ops.find((op) => op[0] === 'upsert') ?? [];
    expect(options).toEqual({ onConflict: 'workspace_id,meta_page_id' });
    expect(rows).toEqual([
      { workspace_id: WS, meta_page_id: '200000000001', name: 'Page 1' },
      { workspace_id: WS, meta_page_id: '200000000002', name: 'Page 2' },
    ]);
    expect(targets(svc)).not.toContain('rpc:set_page_active');
  });

  it('EC-META-03 : une Page active qui n’est plus renvoyée par Meta est désactivée, jamais supprimée', async () => {
    const svc = noAccounts().reply(
      ok(null),
      ok([
        { id: 'p1', meta_page_id: '200000000001', active: true },
        { id: 'lost', meta_page_id: '200000000099', active: true },
        { id: 'idle', meta_page_id: '200000000098', active: false },
      ]),
      ok(null),
    );
    await syncMetaAssets(svc.asService(), input([], [page(1), page(2)], 3));
    const update = svc.calls.find((c) => c.ops.some((op) => op[0] === 'update'));
    expect(update?.ops).toContainEqual(['update', { active: false }]);
    expect(update?.ops).toContainEqual(['in', 'id', ['lost']]);
    expect(svc.calls.some((c) => c.ops.some((op) => op[0] === 'delete'))).toBe(false);
  });

  it('active d’office l’unique Page quand aucune n’est active et que la formule le permet', async () => {
    const svc = noAccounts().reply(
      ok(null),
      ok([{ id: 'p1', meta_page_id: '200000000001', active: false }]),
      ok('ok'),
    );
    await syncMetaAssets(svc.asService(), input([], [page(1)], 1));
    const rpc = svc.calls.find((c) => c.target === 'rpc:set_page_active');
    expect(rpc?.ops).toContainEqual(['args', { ws: WS, p_page: 'p1', want: true, max_pages: 1 }]);
  });

  it('n’active rien d’office si la formule n’autorise aucune Page ou si plusieurs Pages existent', async () => {
    const rows = ok([
      { id: 'p1', meta_page_id: '200000000001', active: false },
      { id: 'p2', meta_page_id: '200000000002', active: false },
    ]);
    const many = noAccounts().reply(ok(null), rows);
    await syncMetaAssets(many.asService(), input([], [page(1), page(2)], 3));
    expect(targets(many)).not.toContain('rpc:set_page_active');
    const none = noAccounts().reply(
      ok(null),
      ok([{ id: 'p1', meta_page_id: '200000000001', active: false }]),
    );
    await syncMetaAssets(none.asService(), input([], [page(1)], 0));
    expect(targets(none)).not.toContain('rpc:set_page_active');
  });

  it('n’active pas d’office si une Page est déjà active', async () => {
    const svc = noAccounts().reply(
      ok(null),
      ok([
        { id: 'p1', meta_page_id: '200000000001', active: true },
        { id: 'p2', meta_page_id: '200000000002', active: false },
      ]),
    );
    await syncMetaAssets(svc.asService(), input([], [page(1)], 1));
    expect(targets(svc)).not.toContain('rpc:set_page_active');
  });

  it('écarte une Page dont l’identifiant n’est pas numérique', async () => {
    const svc = noAccounts().reply(ok([]));
    await syncMetaAssets(svc.asService(), input([], [{ id: 'abc', name: 'x', category: null }], 3));
    expect(
      svc.calls.some((c) => c.ops.some((op) => op[0] === 'upsert') && c.target === 'pages'),
    ).toBe(false);
  });
});
