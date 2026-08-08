/**
 * Tests de la sélection du compte Facebook actif
 * AdsFacile Backend
 *
 * Régression réelle : deux lignes `is_active = true` coexistaient pour un même
 * utilisateur. Le `.single()` employé auparavant échoue dans ce cas, et l'erreur
 * était traitée comme « aucun compte connecté ». Le tableau de bord affichait
 * donc une configuration à 0 % alors que la connexion Facebook était valide.
 */

const mockFrom = jest.fn();

jest.mock('../config/supabase', () => ({ supabase: { from: (...a) => mockFrom(...a) } }));
jest.mock('../services/facebookService', () => ({}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const logger = require('../utils/logger');
const { getActiveAccount, enforceSingleActivePage } = require('./facebookController');

/**
 * Constructeur de requête Supabase simulé : chaque méthode renvoie le même
 * objet, et l'appel terminal résout `resultat`. `appels` enregistre la chaîne
 * réellement utilisée, ce qui permet de vérifier le filtrage.
 */
const requeteSimulee = (resultat) => {
    const appels = [];
    const chaine = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'update', 'delete']) {
        chaine[m] = jest.fn((...args) => { appels.push([m, ...args]); return chaine; });
    }
    chaine.maybeSingle = jest.fn(() => { appels.push(['maybeSingle']); return Promise.resolve(resultat); });
    chaine.single = jest.fn(() => { appels.push(['single']); return Promise.resolve(resultat); });
    // Chaîne terminée par .select() (update ... .select()) : rendue "thenable".
    chaine.then = (resolve) => Promise.resolve(resultat).then(resolve);
    return { chaine, appels };
};

const USER = 'c42ffbf3-e9bf-44af-90cf-044b9feb8e74';

afterEach(() => jest.clearAllMocks());

describe('getActiveAccount', () => {
    it('renvoie le compte actif le plus récent', async () => {
        const ligne = { fb_page_id: '799671609906273', fb_page_name: 'Lyon Deals' };
        const { chaine } = requeteSimulee({ data: ligne, error: null });
        mockFrom.mockReturnValue(chaine);

        const { account, error } = await getActiveAccount(USER, 'fb_page_id, fb_page_name');

        expect(account).toEqual(ligne);
        expect(error).toBeNull();
    });

    it('n\'utilise jamais .single(), qui échoue sur plusieurs lignes actives', async () => {
        const { chaine, appels } = requeteSimulee({ data: null, error: null });
        mockFrom.mockReturnValue(chaine);

        await getActiveAccount(USER, 'fb_page_id');

        expect(chaine.single).not.toHaveBeenCalled();
        expect(chaine.maybeSingle).toHaveBeenCalled();
        expect(appels).toContainEqual(['limit', 1]);
        expect(appels).toContainEqual(['order', 'created_at', { ascending: false }]);
    });

    it('filtre sur l\'utilisateur et sur les lignes actives', async () => {
        const { chaine, appels } = requeteSimulee({ data: null, error: null });
        mockFrom.mockReturnValue(chaine);

        await getActiveAccount(USER, 'fb_page_id');

        expect(appels).toContainEqual(['eq', 'user_id', USER]);
        expect(appels).toContainEqual(['eq', 'is_active', true]);
    });

    it('renvoie account null sans erreur quand aucun compte n\'est actif', async () => {
        const { chaine } = requeteSimulee({ data: null, error: null });
        mockFrom.mockReturnValue(chaine);

        const { account, error } = await getActiveAccount(USER, 'fb_page_id');

        expect(account).toBeNull();
        expect(error).toBeNull();
    });
});

describe('enforceSingleActivePage', () => {
    it('désactive les autres pages actives en épargnant celle qui doit rester', async () => {
        const { chaine, appels } = requeteSimulee({ data: [{ fb_page_id: '1', fb_page_name: 'MboaTv' }], error: null });
        mockFrom.mockReturnValue(chaine);

        await enforceSingleActivePage(USER, '799671609906273');

        expect(appels).toContainEqual(['update', { is_active: false }]);
        expect(appels).toContainEqual(['eq', 'user_id', USER]);
        expect(appels).toContainEqual(['neq', 'fb_page_id', '799671609906273']);
    });

    it('signale les lignes résiduelles désactivées', async () => {
        const { chaine } = requeteSimulee({ data: [{ fb_page_id: '1', fb_page_name: 'MboaTv' }], error: null });
        mockFrom.mockReturnValue(chaine);

        await enforceSingleActivePage(USER, '799671609906273');

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MboaTv'));
    });

    it('reste silencieux quand il n\'y a rien à désactiver', async () => {
        const { chaine } = requeteSimulee({ data: [], error: null });
        mockFrom.mockReturnValue(chaine);

        await enforceSingleActivePage(USER, '799671609906273');

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('journalise une erreur sans lever d\'exception', async () => {
        const { chaine } = requeteSimulee({ data: null, error: { message: 'RLS refuse la mise à jour' } });
        mockFrom.mockReturnValue(chaine);

        await expect(enforceSingleActivePage(USER, '799671609906273')).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), 'RLS refuse la mise à jour');
    });
});
