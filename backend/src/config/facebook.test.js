/**
 * Tests de la configuration Facebook
 * AdsFacile Backend
 */

const VALID_URI = 'https://exemple.trycloudflare.com/api/facebook/callback';

const BASE_ENV = {
    FACEBOOK_APP_ID: '1982764035683375',
    FACEBOOK_APP_SECRET: 'secret-de-test',
    FACEBOOK_REDIRECT_URI: VALID_URI,
    FACEBOOK_GRAPH_VERSION: undefined
};

const CLES_GEREES = Object.keys(BASE_ENV);
let envInitial;

/**
 * Recharge le module avec un environnement donné (la version est lue à l'import).
 * On mute process.env clé par clé : le remplacer entièrement fuiterait sur les
 * autres fichiers de test exécutés dans le même worker Jest.
 */
const loadConfig = (env = {}) => {
    jest.resetModules();
    for (const [cle, valeur] of Object.entries({ ...BASE_ENV, ...env })) {
        if (valeur === undefined) delete process.env[cle];
        else process.env[cle] = valeur;
    }
    return require('./facebook');
};

beforeEach(() => {
    envInitial = Object.fromEntries(CLES_GEREES.map(c => [c, process.env[c]]));
});

afterEach(() => {
    for (const cle of CLES_GEREES) {
        if (envInitial[cle] === undefined) delete process.env[cle];
        else process.env[cle] = envInitial[cle];
    }
    jest.resetModules();
});

describe('version de la Graph API', () => {
    it('utilise FACEBOOK_GRAPH_VERSION quand elle est définie', () => {
        const { GRAPH_VERSION, GRAPH_URL, OAUTH_DIALOG_URL } = loadConfig({ FACEBOOK_GRAPH_VERSION: 'v42.0' });

        expect(GRAPH_VERSION).toBe('v42.0');
        expect(GRAPH_URL).toBe('https://graph.facebook.com/v42.0');
        expect(OAUTH_DIALOG_URL).toBe('https://www.facebook.com/v42.0/dialog/oauth');
    });

    it('retombe sur une version par défaut en l\'absence de variable', () => {
        const { GRAPH_VERSION, GRAPH_URL } = loadConfig({ FACEBOOK_GRAPH_VERSION: undefined });

        expect(GRAPH_VERSION).toMatch(/^v\d+\.\d+$/);
        expect(GRAPH_URL).toContain(GRAPH_VERSION);
    });
});

describe('validateFacebookConfig', () => {
    it('accepte une configuration HTTPS complète', () => {
        const { validateFacebookConfig } = loadConfig();
        const result = validateFacebookConfig();

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('accepte http:// sur localhost sans avertir', () => {
        const { validateFacebookConfig } = loadConfig({
            FACEBOOK_REDIRECT_URI: 'http://localhost:5000/api/facebook/callback'
        });

        expect(validateFacebookConfig().warnings).toEqual([]);
    });

    it.each(['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'])(
        'signale %s manquant',
        (name) => {
            const { validateFacebookConfig } = loadConfig({ [name]: undefined });
            const result = validateFacebookConfig();

            expect(result.valid).toBe(false);
            expect(result.errors.join(' ')).toContain(name);
        }
    );

    it('rejette une URI qui n\'est pas une URL absolue', () => {
        const { validateFacebookConfig } = loadConfig({ FACEBOOK_REDIRECT_URI: '/api/facebook/callback' });
        const result = validateFacebookConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('URL absolue');
    });

    it('rejette une URI dont le chemin ne correspond pas à la route du callback', () => {
        const { validateFacebookConfig } = loadConfig({
            FACEBOOK_REDIRECT_URI: 'https://exemple.com/mauvais/chemin'
        });
        const result = validateFacebookConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('/api/facebook/callback');
    });

    it('avertit sur http:// hors localhost — la configuration que Meta rejette', () => {
        const { validateFacebookConfig } = loadConfig({
            FACEBOOK_REDIRECT_URI: 'http://adsfacile.com/api/facebook/callback'
        });
        const result = validateFacebookConfig();

        expect(result.valid).toBe(true); // c'est un avertissement, pas une erreur bloquante
        expect(result.warnings.join(' ')).toContain('https://');
    });
});
