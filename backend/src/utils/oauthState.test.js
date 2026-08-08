/**
 * Tests du state OAuth Facebook
 * AdsFacile Backend
 *
 * Faille corrigée : le state n'était qu'un base64url de { csrf, userId }, dont
 * le `csrf` n'était jamais revérifié. Un attaquant capable de fabriquer ce
 * payload pouvait rattacher son compte Facebook au compte AdsFacile d'autrui.
 */

process.env.JWT_SECRET = 'secret-de-test-pour-le-state-oauth';

const { createOAuthState, verifyOAuthState, DUREE_VALIDITE_MS, _resetNonces } = require('./oauthState');

const USER = 'c42ffbf3-e9bf-44af-90cf-044b9feb8e74';
const VICTIME = '11111111-2222-3333-4444-555555555555';

/** Encode un payload en state NON signé, tel que produit par l'ancien code. */
const stateNonSigne = (payload) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url');

beforeEach(() => _resetNonces());
afterEach(() => jest.restoreAllMocks());

describe('createOAuthState', () => {
    it('produit un state en deux parties : payload et signature', () => {
        const state = createOAuthState(USER);

        expect(state.split('.')).toHaveLength(2);
    });

    it('produit un state différent à chaque appel', () => {
        expect(createOAuthState(USER)).not.toBe(createOAuthState(USER));
    });

    it('refuse de créer un state sans userId', () => {
        expect(() => createOAuthState(undefined)).toThrow(/userId/);
    });
});

describe('verifyOAuthState', () => {
    it('accepte un state qu\'il vient de produire et restitue le userId', () => {
        const { valid, userId, reason } = verifyOAuthState(createOAuthState(USER));

        expect(valid).toBe(true);
        expect(userId).toBe(USER);
        expect(reason).toBeNull();
    });

    // Cœur de la faille : c'est exactement ce que l'ancien code acceptait.
    it('rejette un state forgé au nom d\'un autre utilisateur', () => {
        const forge = stateNonSigne({ csrf: 'peu importe', userId: VICTIME });

        const { valid, userId } = verifyOAuthState(forge);

        expect(valid).toBe(false);
        expect(userId).toBeNull();
    });

    it('rejette un payload modifié après signature', () => {
        const [, signature] = createOAuthState(USER).split('.');
        const payloadFalsifie = stateNonSigne({ userId: VICTIME, nonce: 'x', exp: Date.now() + 60000 });

        const { valid, reason } = verifyOAuthState(`${payloadFalsifie}.${signature}`);

        expect(valid).toBe(false);
        expect(reason).toBe('signature invalide');
    });

    it('rejette un state signé avec une autre clé', () => {
        const state = createOAuthState(USER);
        process.env.JWT_SECRET = 'une-autre-cle';

        const { valid, reason } = verifyOAuthState(state);

        process.env.JWT_SECRET = 'secret-de-test-pour-le-state-oauth';
        expect(valid).toBe(false);
        expect(reason).toBe('signature invalide');
    });

    it('rejette un state expiré', () => {
        const state = createOAuthState(USER);
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DUREE_VALIDITE_MS + 1000);

        expect(verifyOAuthState(state).reason).toBe('state expiré');
    });

    // Sans usage unique, un state intercepté resterait rejouable 10 minutes.
    it('rejette un state déjà consommé', () => {
        const state = createOAuthState(USER);

        expect(verifyOAuthState(state).valid).toBe(true);
        expect(verifyOAuthState(state).reason).toBe('state déjà utilisé');
    });

    it.each([
        ['chaîne vide', ''],
        ['sans séparateur', 'abcdef'],
        ['signature absente', 'abcdef.'],
        ['non-chaîne', null]
    ])('rejette un state mal formé (%s)', (_nom, valeur) => {
        expect(verifyOAuthState(valeur).valid).toBe(false);
    });

    it('rejette un payload correctement signé mais incomplet', () => {
        // Signature valide obtenue en passant par le module lui-même :
        // on vérifie que la validation ne s'arrête pas à la signature.
        const crypto = require('crypto');
        const payload = stateNonSigne({ userId: USER }); // ni nonce ni exp
        const signature = crypto.createHmac('sha256', process.env.JWT_SECRET)
            .update(payload).digest('base64url');

        expect(verifyOAuthState(`${payload}.${signature}`).reason).toBe('payload incomplet');
    });
});
