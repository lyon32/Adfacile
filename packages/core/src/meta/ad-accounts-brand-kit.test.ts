// Comptes publicitaires et kit de marque (APPFLOW §6.2, F2). La vraie base est prouvée par les
// tests d'intégration des routes.
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { activateAdAccount, listAdAccounts } from './ad-accounts';
import { EMPTY_BRAND_KIT, assertLogoPath, getBrandKit, putBrandKit } from './brand-kit';
import { NOW, WS, memberCtx, ok } from './meta.test-helper';

const ACCOUNT = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  meta_ad_account_id: 'act_100000000001',
  name: 'Compte Awa',
  currency: 'USD',
  has_payment_method: true,
  is_active: true,
  ...over,
});

describe('comptes publicitaires', () => {
  it('liste les comptes de l’espace, filtrés par espace, avec un nom de secours', async () => {
    const db = new FakeClient().reply(
      ok([
        ACCOUNT(),
        ACCOUNT({
          id: 'a2',
          name: null,
          currency: null,
          has_payment_method: null,
          is_active: false,
        }),
      ]),
    );
    const list = await listAdAccounts(memberCtx(db, new FakeClient(), 'viewer'));
    expect(list).toEqual([
      ACCOUNT(),
      {
        id: 'a2',
        meta_ad_account_id: 'act_100000000001',
        name: 'act_100000000001',
        currency: '',
        has_payment_method: null,
        is_active: false,
      },
    ]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
  });

  it('active un compte : vérifié dans l’espace, puis choisi par la base, puis relu', async () => {
    const db = new FakeClient().reply(ok(ACCOUNT({ is_active: false })), ok(ACCOUNT()));
    const svc = new FakeClient().reply(ok(null));
    const result = await activateAdAccount(memberCtx(db, svc), 'a1');
    expect(result.is_active).toBe(true);
    expect(svc.calls[0]?.target).toBe('rpc:set_active_ad_account');
    expect(svc.calls[0]?.ops).toContainEqual(['args', { ws: WS, p_id: 'a1' }]);
  });

  it('un compte d’un autre espace → not_found, rien n’est écrit', async () => {
    const svc = new FakeClient();
    await expect(
      activateAdAccount(memberCtx(new FakeClient().reply(ok(null)), svc), 'a1'),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(svc.calls).toHaveLength(0);
  });

  it.each([
    ['editor', 'active', 'role_insufficient'],
    ['viewer', 'active', 'role_insufficient'],
    ['owner', 'read_only', 'workspace_read_only'],
  ] as const)('refuse %s dans un espace %s', async (role, access, code) => {
    const db = new FakeClient();
    await expect(
      activateAdAccount(memberCtx(db, new FakeClient(), role, access), 'a1'),
    ).rejects.toMatchObject({ code });
    expect(db.calls).toHaveLength(0);
  });
});

const KIT_ROW = {
  logo_path: `${WS}/logo.png`,
  colors: {
    primary: '#112233',
    secondary: 'pas-une-couleur',
    accent: '#FF8800',
    inconnue: '#000000',
  },
  font: 'Sora',
  phone: '+237677000000',
  whatsapp: null,
  tagline: 'Le goût du quartier',
  tone: 'friendly',
  show_number_on_visuals: false,
};

describe('getBrandKit', () => {
  it('valeurs par défaut tant que rien n’est enregistré', async () => {
    const db = new FakeClient().reply(ok({ id: 'p1' }), ok(null));
    expect(await getBrandKit(memberCtx(db, new FakeClient(), 'viewer'), 'p1')).toEqual(
      EMPTY_BRAND_KIT,
    );
  });

  it('relit le kit enregistré : seules les couleurs valides et connues, ton connu', async () => {
    const db = new FakeClient().reply(ok({ id: 'p1' }), ok({ ...KIT_ROW, tone: 'inconnu' }));
    expect(await getBrandKit(memberCtx(db, new FakeClient()), 'p1')).toEqual({
      ...KIT_ROW,
      colors: { primary: '#112233', accent: '#FF8800' },
      tone: null,
    });
  });

  it('couleurs absentes ou mal formées → aucune couleur', async () => {
    const db = new FakeClient().reply(ok({ id: 'p1' }), ok({ ...KIT_ROW, colors: ['#123456'] }));
    expect((await getBrandKit(memberCtx(db, new FakeClient()), 'p1')).colors).toEqual({});
  });

  it('une Page d’un autre espace → not_found', async () => {
    const db = new FakeClient().reply(ok(null));
    await expect(getBrandKit(memberCtx(db, new FakeClient()), 'p1')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
  });
});

describe('putBrandKit', () => {
  it('enregistre avec le client de l’utilisateur (RLS), remplace tout, relit', async () => {
    const db = new FakeClient().reply(
      ok({ id: 'p1' }),
      ok(null),
      ok({ id: 'p1' }),
      ok({ ...KIT_ROW, colors: { primary: '#112233' } }),
    );
    const result = await putBrandKit(memberCtx(db, new FakeClient(), 'editor'), 'p1', {
      logo_path: `${WS}/logo.png`,
      colors: { primary: '#112233', secondary: undefined },
      tagline: 'Le goût du quartier',
    });
    expect(result.colors).toEqual({ primary: '#112233' });
    const upsert = db.calls.find((c) => c.ops.some((op) => op[0] === 'upsert'));
    const [, row, options] = upsert?.ops.find((op) => op[0] === 'upsert') ?? [];
    expect(options).toEqual({ onConflict: 'page_id' });
    expect(row).toEqual({
      page_id: 'p1',
      workspace_id: WS,
      logo_path: `${WS}/logo.png`,
      colors: { primary: '#112233' },
      font: null,
      phone: null,
      whatsapp: null,
      tagline: 'Le goût du quartier',
      tone: null,
      show_number_on_visuals: true,
      updated_at: NOW.toISOString(),
    });
  });

  it.each(['viewer'] as const)('refuse %s', async (role) => {
    await expect(
      putBrandKit(memberCtx(new FakeClient(), new FakeClient(), role), 'p1', {}),
    ).rejects.toMatchObject({ code: 'role_insufficient' });
  });

  it('refuse un espace en lecture seule', async () => {
    await expect(
      putBrandKit(memberCtx(new FakeClient(), new FakeClient(), 'owner', 'read_only'), 'p1', {}),
    ).rejects.toMatchObject({ code: 'workspace_read_only' });
  });

  it('un logo d’un autre espace est refusé avant toute écriture', async () => {
    const db = new FakeClient().reply(ok({ id: 'p1' }));
    await expect(
      putBrandKit(memberCtx(db, new FakeClient()), 'p1', {
        logo_path: '99999999-9999-4999-8999-999999999999/logo.png',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(db.calls.some((c) => c.ops.some((op) => op[0] === 'upsert'))).toBe(false);
  });
});

describe('assertLogoPath', () => {
  it.each([`${WS}/logo.png`, `${WS}/brand/logo-1.v2.webp`])('accepte %s', (path) => {
    expect(() => {
      assertLogoPath(WS, path);
    }).not.toThrow();
  });

  it.each([
    'logo.png',
    WS,
    `${WS}/`,
    `${WS}//logo.png`,
    `${WS}/../autre/logo.png`,
    `${WS}/./logo.png`,
    `${WS}/logo png`,
    `${WS}/logo.png?x=1`,
    `${WS}x/logo.png`,
    `${WS}/${'a'.repeat(300)}`,
  ])('refuse %s', (path) => {
    expect(() => {
      assertLogoPath(WS, path);
    }).toThrow(expect.objectContaining({ code: 'validation_failed' }));
  });
});
