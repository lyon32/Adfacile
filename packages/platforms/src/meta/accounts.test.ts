import { describe, expect, it } from 'vitest';
import { MetaGraphError } from './errors';
import { failure, FakeGraph } from './fake-graph.test-helper';
import {
  describeAdAccountStatus,
  getAdAccountPixels,
  getAdAccounts,
  getBusinessPixels,
  getConnectedInstagramAccount,
  getConnectedWhatsAppAccount,
  getGrantedPermissions,
  getPixelsOverview,
  getUserPages,
  getWhatsAppAccounts,
  listAdAccountsWithPixels,
  pageTokenOrUser,
} from './accounts';
import { toAppError } from './errors';

// Tests portés de backend/src/services/facebookPixels.test.js et backend/src/controllers/adAccountSwitch.test.js
// (TR-PLA-02) : `jest.mock('axios')` est remplacé par une fausse Graph API.
const refus = (message: string) => failure({ code: 200, message }, 403);

describe('getBusinessPixels', () => {
  it("liste les ensembles de l'entreprise avec leur nom", async () => {
    const graph = new FakeGraph(() => ({
      data: [
        { id: '1', name: 'Mon pixel' },
        { id: '2', name: 'Boutique' },
      ],
    }));

    const pixels = await getBusinessPixels(graph.client(), 'B1', 'jeton');

    expect(pixels).toEqual([
      { id: '1', name: 'Mon pixel', last_fired_time: null },
      { id: '2', name: 'Boutique', last_fired_time: null },
    ]);
    expect(graph.calls[0]?.path).toMatch(/B1\/owned_pixels$/);
  });

  it('renvoie une liste vide sans entreprise, sans appeler Meta', async () => {
    const graph = new FakeGraph(() => ({}));
    expect(await getBusinessPixels(graph.client(), null, 'jeton')).toEqual([]);
    expect(graph.calls).toHaveLength(0);
  });

  it("renvoie une liste vide si le jeton n'a pas la permission, sans lever", async () => {
    const graph = new FakeGraph(() => refus('(#200) Requires business_management permission'));
    expect(await getBusinessPixels(graph.client(), 'B1', 'jeton')).toEqual([]);
  });
});

describe('getPixelsOverview', () => {
  it('sépare rattachés et non rattachés, sans doublon', async () => {
    const graph = new FakeGraph((call) => {
      if (call.path.endsWith('/adspixels')) return { data: [{ id: '1', name: 'Rattaché' }] };
      if (call.path.endsWith('/owned_pixels')) {
        return {
          data: [
            { id: '1', name: 'Rattaché' },
            { id: '2', name: "Seul dans l'entreprise" },
          ],
        };
      }
      return { business: { id: 'B1' } };
    });

    const vue = await getPixelsOverview(graph.client(), 'act_9', 'jeton');

    expect(vue.attached.map((p) => p.id)).toEqual(['1']);
    expect(vue.business_unattached).toEqual([
      { id: '2', name: "Seul dans l'entreprise", last_fired_time: null },
    ]);
  });

  it("lit l'entreprise du compte quand elle n'est pas fournie", async () => {
    const graph = new FakeGraph((call) => {
      if (call.path.endsWith('/adspixels')) return { data: [] };
      if (call.path.endsWith('/owned_pixels')) return { data: [{ id: '2', name: 'X' }] };
      expect(call.params.fields).toMatch(/business/);
      return { business: { id: 'B1' } };
    });

    const vue = await getPixelsOverview(graph.client(), '9', 'jeton');
    expect(vue.business_unattached).toHaveLength(1);
    expect(graph.calls.map((c) => c.path)).toContain('act_9');
  });

  it("renvoie les rattachés même si la lecture de l'entreprise échoue", async () => {
    const graph = new FakeGraph((call) =>
      call.path.endsWith('/adspixels') ? { data: [{ id: '1', name: 'P' }] } : refus('permission'),
    );

    const vue = await getPixelsOverview(graph.client(), 'act_9', 'jeton');
    expect(vue.attached).toHaveLength(1);
    expect(vue.business_unattached).toEqual([]);
  });

  it('utilise l’entreprise fournie sans la relire sur le compte', async () => {
    const graph = new FakeGraph((call) =>
      call.path.endsWith('/adspixels') ? { data: [] } : { data: [{ id: '5', name: 'Z' }] },
    );
    const vue = await getPixelsOverview(graph.client(), 'act_9', 'jeton', 'B7');
    expect(vue.business_unattached.map((p) => p.id)).toEqual(['5']);
    expect(graph.calls.map((c) => c.path)).not.toContain('act_9');
  });

  it('échoue si le compte lui-même est illisible (comportement existant)', async () => {
    const graph = new FakeGraph(() => refus('compte refusé'));
    await expect(getPixelsOverview(graph.client(), 'act_9', 'jeton')).rejects.toThrow(
      /ensembles de données/,
    );
  });
});

describe('getAdAccountPixels (inchangé)', () => {
  it('écarte les ensembles indisponibles', async () => {
    const graph = new FakeGraph(() => ({
      data: [
        { id: '1', name: 'A' },
        { id: '2', name: 'B', is_unavailable: true },
      ],
    }));
    expect((await getAdAccountPixels(graph.client(), 'act_1', 't')).map((p) => p.id)).toEqual([
      '1',
    ]);
  });

  it('préfixe act_ au numéro de compte et nomme un pixel sans nom', async () => {
    const graph = new FakeGraph(() => ({
      data: [{ id: '7', last_fired_time: '2026-10-01T00:00:00+0000' }],
    }));
    const pixels = await getAdAccountPixels(graph.client(), '123', 't');
    expect(graph.calls[0]?.path).toBe('act_123/adspixels');
    expect(pixels).toEqual([
      { id: '7', name: 'Pixel 7', last_fired_time: '2026-10-01T00:00:00+0000' },
    ]);
  });
});

describe('comptes publicitaires', () => {
  const COMPTES = [
    { id: 'act_3370547936417539', name: 'aaron', account_status: 2, currency: 'USD' },
    {
      id: 'act_1086412686842710',
      name: 'lyon',
      account_status: 1,
      currency: 'USD',
      timezone_name: 'Africa/Douala',
    },
  ];

  it('rend le statut en clair et le nombre d’ensembles de données', async () => {
    // Les pixels d'un côté (compte désactivé), le compte utilisable de l'autre : la situation qui rendait
    // le suivi des achats incompréhensible.
    const graph = new FakeGraph((call) => {
      if (call.path === 'me/adaccounts') return { data: COMPTES };
      return call.path.startsWith('act_3370547936417539')
        ? { data: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] }
        : { data: [] };
    });

    const comptes = await listAdAccountsWithPixels(graph.client(), 'jeton');
    const aaron = comptes.find((c) => c.name === 'aaron');
    const lyon = comptes.find((c) => c.name === 'lyon');

    expect(aaron).toMatchObject({ statusLabel: 'Désactivé', usable: false, pixelsCount: 4 });
    expect(lyon).toMatchObject({
      statusLabel: 'Actif',
      usable: true,
      pixelsCount: 0,
      timezone: 'Africa/Douala',
    });
  });

  it("n'échoue pas quand un compte refuse la lecture de ses pixels", async () => {
    const graph = new FakeGraph((call) =>
      call.path === 'me/adaccounts' ? { data: COMPTES } : refus('accès refusé'),
    );
    const comptes = await listAdAccountsWithPixels(graph.client(), 'jeton');
    expect(comptes[0]?.pixelsCount).toBeNull();
  });

  it('jeton révoqué par Meta (190/460) → meta_token_expired, pas une erreur générique', async () => {
    // Relevé réel du 7 oct. 2026 : l'écran affichait « Erreur récupération des comptes publicitaires »
    // sans dire que Facebook avait coupé la session.
    const graph = new FakeGraph(() =>
      failure({ code: 190, error_subcode: 460, message: 'x' }, 401),
    );
    const error = await getAdAccounts(graph.client(), 'jeton').catch((e: unknown) => e);
    expect(toAppError(error).code).toBe('meta_token_expired');
  });

  it('les statuts de Meta sont traduits, un statut inconnu est refusé par prudence', () => {
    expect(describeAdAccountStatus(1)).toEqual({ usable: true, label: 'Actif' });
    expect(describeAdAccountStatus(9).usable).toBe(true);
    expect(describeAdAccountStatus(3).label).toBe('Impayé');
    expect(describeAdAccountStatus(42)).toEqual({ usable: false, label: 'Statut inconnu' });
  });

  it('un compte sans nom ni statut reste lisible', async () => {
    const graph = new FakeGraph(() => ({ data: [{ id: 'act_5' }] }));
    const [compte] = await getAdAccounts(graph.client(), 'jeton');
    expect(compte).toMatchObject({ name: 'act_5', usable: false, currency: null, timezone: null });
  });
});

describe('Pages et permissions', () => {
  it('liste les Pages avec leur jeton propre, comme AdFacile (me/accounts avec access_token)', async () => {
    const graph = new FakeGraph(() => ({
      data: [
        { id: 'P1', name: 'Lyon Deals', category: 'Boutique', access_token: 'JETON-PAGE' },
        { id: 'P2' },
      ],
    }));
    const pages = await getUserPages(graph.client(), 'jeton');
    expect(pages).toEqual([
      { id: 'P1', name: 'Lyon Deals', category: 'Boutique', accessToken: 'JETON-PAGE' },
      { id: 'P2', name: 'P2', category: null, accessToken: null },
    ]);
    expect(graph.calls[0]?.params.fields).toMatch(/access_token/);
  });

  it('utilise le jeton de la Page quand il existe, sinon celui de l’utilisateur (repli d’AdFacile)', () => {
    expect(pageTokenOrUser({ accessToken: 'PAGE' }, 'USER')).toBe('PAGE');
    expect(pageTokenOrUser({ accessToken: null }, 'USER')).toBe('USER');
    expect(pageTokenOrUser(undefined, 'USER')).toBe('USER');
  });

  it('conserve la cause de Meta quand la lecture des Pages échoue', async () => {
    const graph = new FakeGraph(() => failure({ code: 190, message: 'x' }, 401));
    const error = await getUserPages(graph.client(), 'jeton').catch((e: unknown) => e);
    expect(toAppError(error).code).toBe('meta_token_expired');
  });

  it('ne garde que les permissions accordées', async () => {
    const graph = new FakeGraph(() => ({
      data: [
        { permission: 'ads_management', status: 'granted' },
        { permission: 'instagram_basic', status: 'declined' },
      ],
    }));
    expect(await getGrantedPermissions(graph.client(), 'jeton')).toEqual(['ads_management']);
  });

  it('signale l’échec de lecture des permissions', async () => {
    const graph = new FakeGraph(() => refus('non'));
    await expect(getGrantedPermissions(graph.client(), 'jeton')).rejects.toThrow(/permissions/);
  });
});

describe('Instagram et WhatsApp', () => {
  it('trouve le compte Instagram professionnel de la Page, ou null sans lever', async () => {
    const avec = new FakeGraph(() => ({
      instagram_business_account: { id: '1784', username: 'lyon' },
    }));
    expect(await getConnectedInstagramAccount(avec.client(), 'P1', 'jeton')).toEqual({
      id: '1784',
      username: 'lyon',
    });
    const sans = new FakeGraph(() => ({ id: 'P1' }));
    expect(await getConnectedInstagramAccount(sans.client(), 'P1', 'jeton')).toBeNull();
    const panne = new FakeGraph(() => failure({ code: 190, message: 'x' }, 401));
    expect(await getConnectedInstagramAccount(panne.client(), 'P1', 'jeton')).toBeNull();
  });

  it('trouve WhatsApp sur la Page', async () => {
    const graph = new FakeGraph(() => ({
      whatsapp_business_account: { id: 'W1', phone_number: '+237650198196', verified_name: 'Lyon' },
    }));
    expect(await getConnectedWhatsAppAccount(graph.client(), 'P1', 'jeton')).toEqual({
      id: 'W1',
      phoneNumber: '+237650198196',
      verifiedName: 'Lyon',
    });
  });

  it('retombe sur le Business Manager quand la Page n’a pas de WhatsApp', async () => {
    const graph = new FakeGraph((call) => {
      if (call.path === 'P1') return {};
      if (call.path === 'me/businesses') return { data: [{ id: 'B1', name: 'Entreprise' }] };
      if (call.path === 'B1/owned_whatsapp_business_accounts') return { data: [] };
      if (call.path === 'B1/client_whatsapp_business_accounts') return refus('non');
      return { data: [{ id: 'W2', phone_number: '+237600000000' }] };
    });
    expect(await getConnectedWhatsAppAccount(graph.client(), 'P1', 'jeton')).toEqual({
      id: 'W2',
      phoneNumber: '+237600000000',
      verifiedName: null,
    });
  });

  it('retombe sur le Business Manager quand la lecture de la Page échoue', async () => {
    const graph = new FakeGraph((call) =>
      call.path === 'P1' ? refus('non') : call.path === 'me/businesses' ? { data: [] } : {},
    );
    expect(await getConnectedWhatsAppAccount(graph.client(), 'P1', 'jeton')).toBeNull();
  });

  it('cesse de chercher dès que le jeton est invalide', async () => {
    const graph = new FakeGraph((call) =>
      call.path === 'me/businesses'
        ? { data: [{ id: 'B1' }] }
        : failure({ code: 190, message: 'x' }, 401),
    );
    expect(await getWhatsAppAccounts(graph.client(), 'jeton')).toBeNull();
    expect(graph.calls).toHaveLength(2);
  });

  it('renvoie null si la liste des entreprises est illisible', async () => {
    const graph = new FakeGraph(() => refus('non'));
    expect(await getWhatsAppAccounts(graph.client(), 'jeton')).toBeNull();
  });
});

it('MetaGraphError garde le statut HTTP et le message technique pour le diagnostic', async () => {
  const graph = new FakeGraph(() => failure({ code: 100, message: 'Invalid parameter' }, 400));
  const error = await graph
    .client()
    .get('x')
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(MetaGraphError);
  expect(error).toMatchObject({ httpStatus: 400, message: 'Invalid parameter' });
});
