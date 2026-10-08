/**
 * Tests du changement de compte publicitaire
 *
 * Le compte était choisi en silence à la connexion — le premier actif de la
 * liste — et jamais modifiable. Relevé sur un compte réel : les quatre
 * ensembles de données vivaient sur « aaron », désactivé, tandis que les
 * campagnes partaient sur « lyon », actif et sans pixel. D'où deux règles que
 * ces tests verrouillent : on ne bascule que vers un compte du jeton, et
 * jamais vers un compte que Meta refuse.
 */

const mockFrom = jest.fn();

jest.mock('../config/supabase', () => ({ supabase: { from: (...a) => mockFrom(...a) } }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockGetAdAccounts = jest.fn();
const mockGetPixels = jest.fn();

jest.mock('../services/facebookService', () => ({
    getAdAccounts: (...a) => mockGetAdAccounts(...a),
    getAdAccountPixels: (...a) => mockGetPixels(...a),
    decryptToken: () => 'jeton-en-clair',
    describeAdAccountStatus: jest.requireActual('../services/facebookService').describeAdAccountStatus
}));

const { getAdAccountsForUser, switchAdAccount } = require('./facebookController');

const COMPTES = [
    { id: 'act_3370547936417539', name: 'aaron', account_status: 2, currency: 'USD' },
    { id: 'act_1086412686842710', name: 'lyon', account_status: 1, currency: 'USD' }
];

/** Chaîne Supabase simulée : toute méthode renvoie la chaîne, le tout est thenable. */
const chaineSimulee = (resultat) => {
    const chaine = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'update']) {
        chaine[m] = jest.fn(() => chaine);
    }
    chaine.maybeSingle = jest.fn(() => Promise.resolve(resultat));
    chaine.then = (resolve) => Promise.resolve(resultat).then(resolve);
    return chaine;
};

const reponse = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const REQ = (body = {}) => ({ user: { id: 'u1' }, body });

beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue(chaineSimulee({
        data: { fb_account_id: 'act_1086412686842710', fb_access_token: 'chiffre' },
        error: null
    }));
    mockGetAdAccounts.mockResolvedValue(COMPTES);
    mockGetPixels.mockResolvedValue([]);
});

describe('getAdAccountsForUser', () => {
    it('jeton révoqué par Meta (190/460) → 401 reconnexion, pas un 502 générique', async () => {
        // Relevé réel du 7 oct. 2026 : l'écran affichait « Erreur récupération
        // des comptes publicitaires » sans dire que Facebook avait coupé la session.
        const erreur = new Error('Impossible de récupérer les comptes publicitaires');
        erreur.response = { data: { error: { code: 190, error_subcode: 460 } } };
        mockGetAdAccounts.mockRejectedValue(erreur);

        const res = reponse();
        await getAdAccountsForUser(REQ(), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'FACEBOOK_RECONNECT_REQUIRED' });
    });

    it('rend le statut en clair et le nombre d\'ensembles de données', async () => {
        mockGetPixels.mockImplementation(async (id) => (
            id === 'act_3370547936417539' ? [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] : []
        ));

        const res = reponse();
        await getAdAccountsForUser(REQ(), res);

        const { ad_accounts } = res.json.mock.calls[0][0].data;
        const aaron = ad_accounts.find(c => c.name === 'aaron');
        const lyon = ad_accounts.find(c => c.name === 'lyon');

        // C'est exactement la situation qui rendait le suivi des achats
        // incompréhensible : les pixels d'un côté, le compte utilisable de
        // l'autre.
        expect(aaron).toMatchObject({ status_label: 'Désactivé', usable: false, pixels_count: 4 });
        expect(lyon).toMatchObject({ status_label: 'Actif', usable: true, pixels_count: 0, is_active: true });
    });

    it('n\'échoue pas quand un compte refuse la lecture de ses pixels', async () => {
        mockGetPixels.mockRejectedValue(new Error('accès refusé'));

        const res = reponse();
        await getAdAccountsForUser(REQ(), res);

        expect(res.status).not.toHaveBeenCalledWith(502);
        expect(res.json.mock.calls[0][0].data.ad_accounts[0].pixels_count).toBeNull();
    });
});

describe('switchAdAccount', () => {
    it('bascule vers un compte actif du jeton', async () => {
        const res = reponse();
        await switchAdAccount(REQ({ ad_account_id: 'act_1086412686842710' }), res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('refuse un compte désactivé plutôt que de laisser la campagne échouer', async () => {
        const res = reponse();
        await switchAdAccount(REQ({ ad_account_id: 'act_3370547936417539' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/désactivé/i);
    });

    it('refuse un compte absent du jeton', async () => {
        const res = reponse();
        await switchAdAccount(REQ({ ad_account_id: 'act_999999999999999' }), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('exige un identifiant', async () => {
        const res = reponse();
        await switchAdAccount(REQ({}), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});
