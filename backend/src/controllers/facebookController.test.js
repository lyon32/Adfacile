/**
 * Tests de la génération de l'URL OAuth Facebook
 * AdsFacile Backend
 *
 * Périmètre volontairement restreint à getAuthUrl : c'est la partie pure du
 * flux, testable sans appeler Meta. Supabase et le service Facebook sont
 * simulés car ils exigent des variables d'environnement et du réseau.
 */

jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('../services/facebookService', () => ({}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const REDIRECT_URI = 'https://exemple.trycloudflare.com/api/facebook/callback';
const APP_ID = '1982764035683375';
const USER_ID = 'c42ffbf3-e9bf-44af-90cf-044b9feb8e74';

const SCOPES_ATTENDUS = [
    'pages_show_list',
    'ads_management',
    'business_management',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_insights',
    'whatsapp_business_management'
];

const BASE_ENV = {
    FACEBOOK_APP_ID: APP_ID,
    FACEBOOK_APP_SECRET: 'secret-de-test',
    FACEBOOK_REDIRECT_URI: REDIRECT_URI,
    FACEBOOK_GRAPH_VERSION: 'v23.0',
    // Requis depuis que le state OAuth est signé (voir utils/oauthState.js)
    JWT_SECRET: 'secret-de-test-pour-le-state-oauth'
};

/**
 * Recharge le contrôleur pour que la config lise l'environnement courant.
 * `undefined` supprime la clé : une affectation directe la transformerait en
 * la chaîne "undefined", ce que process.env fait silencieusement.
 */
const loadController = (env = {}) => {
    jest.resetModules();
    for (const [cle, valeur] of Object.entries({ ...BASE_ENV, ...env })) {
        if (valeur === undefined) delete process.env[cle];
        else process.env[cle] = valeur;
    }
    return require('./facebookController');
};

/** Appelle getAuthUrl et renvoie { status, payload }. */
const appeler = async (env = {}) => {
    const { getAuthUrl } = loadController(env);
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    await getAuthUrl({ user: { id: USER_ID } }, { json, status });

    return {
        status: status.mock.calls[0]?.[0] ?? 200,
        payload: json.mock.calls[0][0]
    };
};

/** Appelle getAuthUrl et renvoie l'URL générée, déjà parsée. */
const genererUrl = async (env = {}) => {
    const { payload } = await appeler(env);
    expect(payload.success).toBe(true);
    return new URL(payload.data.authUrl);
};

afterEach(() => {
    Object.keys(BASE_ENV).forEach(cle => delete process.env[cle]);
    jest.resetModules();
});

describe('getAuthUrl', () => {
    it('cible le dialogue OAuth de la version configurée', async () => {
        const url = await genererUrl();

        expect(url.origin).toBe('https://www.facebook.com');
        expect(url.pathname).toBe('/v23.0/dialog/oauth');
    });

    it('transmet le client_id et le redirect_uri exact de l\'environnement', async () => {
        const url = await genererUrl();

        expect(url.searchParams.get('client_id')).toBe(APP_ID);
        expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    });

    it('demande les 7 permissions attendues', async () => {
        const url = await genererUrl();
        const scopes = url.searchParams.get('scope').split(',');

        expect(scopes).toEqual(SCOPES_ATTENDUS);
    });

    it('transporte le userId de l\'appelant dans un state signé', async () => {
        const url = await genererUrl();
        const state = url.searchParams.get('state');
        const [payloadEncode, signature] = state.split('.');
        const payload = JSON.parse(Buffer.from(payloadEncode, 'base64url').toString());

        expect(payload.userId).toBe(USER_ID);
        expect(payload.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(payload.exp).toBeGreaterThan(Date.now());
        expect(signature).toBeTruthy();
    });

    it('produit un state que le vérificateur accepte', async () => {
        const url = await genererUrl();
        const { verifyOAuthState } = require('../utils/oauthState');

        expect(verifyOAuthState(url.searchParams.get('state'))).toEqual({
            valid: true, userId: USER_ID, reason: null
        });
    });

    it('produit un state différent à chaque appel', async () => {
        const premier = await genererUrl();
        const second = await genererUrl();

        expect(premier.searchParams.get('state')).not.toBe(second.searchParams.get('state'));
    });

    // Régression : sans cette garde, l'URL partait avec redirect_uri=undefined
    // et Meta répondait « Impossible de charger cette URL » — écran opaque,
    // impossible à relier à une variable d'environnement manquante.
    it('refuse de générer une URL quand la configuration est incomplète', async () => {
        const { status, payload } = await appeler({ FACEBOOK_REDIRECT_URI: undefined });

        expect(status).toBe(500);
        expect(payload.success).toBe(false);
        expect(payload.data).toBeUndefined();
    });
});
