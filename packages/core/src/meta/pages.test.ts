// Pages Facebook : liste, activation dans la limite de la formule, verrou de la période
// (APPFLOW §6.2, TR-PLA-08). La vraie base est prouvée par les tests d'intégration des routes.
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { listPages, updatePage, upgradeTarget } from './pages';
import { STARTER_PLAN, WS, memberCtx, ok, PLANS } from './meta.test-helper';

const PAGE = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  meta_page_id: '200000000001',
  name: 'Boutique Awa',
  active: true,
  instagram_account_id: null,
  whatsapp_linked: false,
  ad_language: 'fr',
  ad_address: 'vous',
  ...over,
});
const PRO_PLAN = [
  ok([
    { workspace_id: WS, plan_code: 'pro', status: 'active', period_end: 'x', grace_until: null },
  ]),
  PLANS,
  ok({ period_start: '2026-10-01T00:00:00.000Z' }),
];

describe('upgradeTarget', () => {
  it('propose la formule au-dessus, aucune pour la plus haute', () => {
    expect(upgradeTarget('starter')).toBe('pro');
    expect(upgradeTarget('pro')).toBe('business');
    expect(upgradeTarget('business')).toBeNull();
  });
});

describe('listPages', () => {
  it('liste les Pages avec leur état, la limite de la formule et les Pages verrouillées', async () => {
    const db = new FakeClient().reply(
      ok([
        PAGE({
          instagram_account_id: '300000000001',
          whatsapp_linked: true,
          ad_language: 'en',
          ad_address: 'tu',
        }),
        PAGE({ id: 'p2', name: null, meta_page_id: '200000000002', active: false }),
      ]),
      ok([{ page_id: 'p1', first_campaign_at: '2026-10-05T10:00:00Z' }]),
    );
    const svc = new FakeClient().reply(...PRO_PLAN);
    const result = await listPages(memberCtx(db, svc, 'viewer'));
    expect(result.quotas).toEqual({ pages_active: 1, pages_limit: 3 });
    expect(result.data).toEqual([
      {
        id: 'p1',
        meta_page_id: '200000000001',
        name: 'Boutique Awa',
        active: true,
        locked_for_period: true,
        instagram_linked: true,
        whatsapp_linked: true,
        ad_language: 'en',
        ad_address: 'tu',
      },
      expect.objectContaining({
        id: 'p2',
        name: '200000000002',
        active: false,
        locked_for_period: false,
      }),
    ]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(db.calls[1]?.ops).toContainEqual(['eq', 'period_start', '2026-10-01T00:00:00.000Z']);
  });

  it('sans abonnement : limite de Starter et aucune Page verrouillée (pas de période)', async () => {
    const db = new FakeClient().reply(ok([PAGE()]));
    const svc = new FakeClient().reply(...STARTER_PLAN);
    const result = await listPages(memberCtx(db, svc));
    expect(result.quotas).toEqual({ pages_active: 1, pages_limit: 1 });
    expect(result.data[0]?.locked_for_period).toBe(false);
    expect(db.calls).toHaveLength(1);
  });
});

describe('updatePage', () => {
  /** Lecture initiale (404 si absente), puis relecture finale. */
  const dbWith = (...extra: ReturnType<typeof ok>[]) =>
    new FakeClient().reply(ok(PAGE()), ...extra);

  it('active une Page : la limite et la période sont transmises à la base', async () => {
    const db = dbWith(ok([]), ok(PAGE({ active: true })), ok([]));
    // lecture 1 (page), verrous 1, relecture (page), verrous 2
    const svc = new FakeClient().reply(...PRO_PLAN, ok('ok'));
    const result = await updatePage(memberCtx(db, svc), 'p1', { active: true });
    expect(result.active).toBe(true);
    const rpc = svc.calls.find((c) => c.target === 'rpc:set_page_active');
    expect(rpc?.ops).toContainEqual([
      'args',
      {
        ws: WS,
        p_page: 'p1',
        want: true,
        max_pages: 3,
        p_period_start: '2026-10-01T00:00:00.000Z',
      },
    ]);
  });

  it('TR-PLA-08 : limite atteinte → 402 page_limit_reached avec la formule à proposer, rien d’autre n’est écrit', async () => {
    const db = dbWith(ok([]));
    const svc = new FakeClient().reply(...STARTER_PLAN, ok('limit'));
    await expect(
      updatePage(memberCtx(db, svc), 'p1', { active: true, ad_language: 'en' }),
    ).rejects.toMatchObject({
      code: 'page_limit_reached',
      opts: { meta: { pages_limit: 1, upgrade_to: 'pro' } },
    });
    expect(db.calls.some((c) => c.ops.some((op) => op[0] === 'update'))).toBe(false);
  });

  it('formule la plus haute : pas de formule à proposer', async () => {
    const business = [
      ok([
        {
          workspace_id: WS,
          plan_code: 'business',
          status: 'active',
          period_end: 'x',
          grace_until: null,
        },
      ]),
      ok([{ code: 'business', max_members: 5, max_pages: 10, campaigns_per_period: 10 }]),
      ok(null),
    ];
    const svc = new FakeClient().reply(...business, ok('limit'));
    await expect(
      updatePage(memberCtx(dbWith(), svc), 'p1', { active: true }),
    ).rejects.toMatchObject({
      code: 'page_limit_reached',
      opts: { meta: { pages_limit: 10 } },
    });
  });

  it('Page verrouillée pour la période → 409 conflict (page_locked)', async () => {
    const svc = new FakeClient().reply(...PRO_PLAN, ok('locked'));
    await expect(
      updatePage(memberCtx(dbWith(ok([])), svc), 'p1', { active: false }),
    ).rejects.toMatchObject({
      code: 'conflict',
      opts: { meta: { reason: 'page_locked' } },
    });
  });

  it('règle la langue et le ton des pubs avec le client de l’utilisateur, filtré par espace', async () => {
    const db = dbWith(ok(null), ok(PAGE({ ad_language: 'en', ad_address: 'tu' })));
    const svc = new FakeClient().reply(...STARTER_PLAN);
    const result = await updatePage(memberCtx(db, svc, 'editor'), 'p1', {
      ad_language: 'en',
      ad_address: 'tu',
    });
    expect(result).toMatchObject({ ad_language: 'en', ad_address: 'tu' });
    const update = db.calls.find((c) => c.ops.some((op) => op[0] === 'update'));
    expect(update?.ops).toContainEqual(['update', { ad_language: 'en', ad_address: 'tu' }]);
    expect(update?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(svc.calls.some((c) => c.target === 'rpc:set_page_active')).toBe(false);
  });

  it.each([
    ['editor', { active: true }],
    ['viewer', { ad_language: 'en' as const }],
  ] as const)('refuse %s', async (role, patch) => {
    const svc = new FakeClient();
    await expect(
      updatePage(memberCtx(new FakeClient(), svc, role), 'p1', patch),
    ).rejects.toMatchObject({
      code: 'role_insufficient',
    });
    expect(svc.calls).toHaveLength(0);
  });

  it('refuse un espace en lecture seule', async () => {
    await expect(
      updatePage(memberCtx(new FakeClient(), new FakeClient(), 'owner', 'read_only'), 'p1', {
        active: true,
      }),
    ).rejects.toMatchObject({ code: 'workspace_read_only' });
  });

  it('une Page d’un autre espace → not_found avant toute écriture', async () => {
    const db = new FakeClient().reply(ok(null));
    const svc = new FakeClient().reply(...STARTER_PLAN);
    await expect(updatePage(memberCtx(db, svc), 'p1', { active: true })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(svc.calls.some((c) => c.target === 'rpc:set_page_active')).toBe(false);
  });
});
