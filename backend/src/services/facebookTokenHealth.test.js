/**
 * Tests de la santé du jeton Facebook
 *
 * Relevé réel (7 oct. 2026) : Meta avait invalidé le jeton (code 190, sous-code
 * 460 — mot de passe changé ou session réinitialisée par Facebook). AdsFacile
 * affichait pourtant « connecté », et la recherche de localisation comme les
 * comptes publicitaires échouaient en 500/502 génériques. Ces tests verrouillent
 * la détection et la réponse unique « reconnexion requise ».
 */

const mockGet = jest.fn();
jest.mock('axios', () => ({ get: (...a) => mockGet(...a) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const sante = require('./facebookTokenHealth');

const erreurMeta = (code, subcode) => ({ response: { data: { error: { code, error_subcode: subcode, message: 'x' } } } });

const resFactice = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

beforeEach(() => {
    mockGet.mockReset();
    sante._viderCache();
    process.env.FACEBOOK_APP_ID = 'app';
    process.env.FACEBOOK_APP_SECRET = 'secret';
});

describe('isTokenRevokedError', () => {
    it('reconnaît le code 190 quel que soit le sous-code', () => {
        expect(sante.isTokenRevokedError(erreurMeta(190, 460))).toBe(true);
        expect(sante.isTokenRevokedError(erreurMeta(190, 463))).toBe(true);
        expect(sante.isTokenRevokedError(erreurMeta(190))).toBe(true);
    });

    it('ignore les autres erreurs', () => {
        expect(sante.isTokenRevokedError(erreurMeta(100))).toBe(false);
        expect(sante.isTokenRevokedError(new Error('réseau'))).toBe(false);
        expect(sante.isTokenRevokedError(undefined)).toBe(false);
    });
});

describe('checkToken', () => {
    it('jeton invalide chez Meta → valid:false, raison revoked, sous-code conservé', async () => {
        mockGet.mockResolvedValue({ data: { data: { is_valid: false, error: { code: 190, subcode: 460 } } } });
        const r = await sante.checkToken('u1', 'jeton');
        expect(r).toMatchObject({ valid: false, reason: 'revoked', subcode: 460 });
    });

    it('jeton valide → renvoie la date de fin d\'accès aux données', async () => {
        mockGet.mockResolvedValue({ data: { data: { is_valid: true, data_access_expires_at: 1794213779 } } });
        const r = await sante.checkToken('u1', 'jeton');
        expect(r.valid).toBe(true);
        expect(r.dataAccessExpiresAt).toBe(new Date(1794213779 * 1000).toISOString());
    });

    it('met en cache : un seul appel à Meta pour deux vérifications rapprochées', async () => {
        mockGet.mockResolvedValue({ data: { data: { is_valid: true } } });
        await sante.checkToken('u1', 'jeton');
        await sante.checkToken('u1', 'jeton');
        expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('Meta injoignable → état inconnu (valid:null), jamais « révoqué » à tort', async () => {
        mockGet.mockRejectedValue(new Error('ETIMEDOUT'));
        const r = await sante.checkToken('u1', 'jeton');
        expect(r.valid).toBeNull();
    });

    it('markRevoked force l\'état révoqué sans rappeler Meta', async () => {
        sante.markRevoked('u1', 460);
        const r = await sante.checkToken('u1', 'jeton');
        expect(r).toMatchObject({ valid: false, reason: 'revoked' });
        expect(mockGet).not.toHaveBeenCalled();
    });
});

describe('respondIfRevoked', () => {
    it('erreur 190 → 401 FACEBOOK_RECONNECT_REQUIRED et compte marqué révoqué', async () => {
        const res = resFactice();
        const traite = sante.respondIfRevoked(res, erreurMeta(190, 460), 'u1');
        expect(traite).toBe(true);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'FACEBOOK_RECONNECT_REQUIRED' });
        const r = await sante.checkToken('u1', 'jeton');
        expect(r.valid).toBe(false);
    });

    it('autre erreur → ne répond pas, laisse l\'appelant gérer', () => {
        const res = resFactice();
        expect(sante.respondIfRevoked(res, erreurMeta(100), 'u1')).toBe(false);
        expect(res.status).not.toHaveBeenCalled();
    });
});
