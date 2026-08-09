jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('./facebookService', () => ({ decryptToken: (t) => t }));
jest.mock('../utils/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));
jest.mock('axios');

const axios = require('axios');
const { supabase } = require('../config/supabase');
const {
    resolveDestination,
    buildPromotedObject,
    uploadAdImage,
    rollbackFacebookObjects,
    getFacebookAccount
} = require('./facebookAdsService');

const PAGE = {
    fb_page_id: '799671609906273',
    fb_page_name: 'Lyon Deals',
    instagram_connected: true,
    whatsapp_connected: true,
    whatsapp_number: '+237650198196'
};

beforeEach(() => jest.clearAllMocks());

describe('resolveDestination — site web', () => {
    it('conserve la destination site web et son objectif', () => {
        const result = resolveDestination(
            { destination_type: 'WEBSITE', optimization_goal: 'LANDING_PAGE_VIEWS' },
            PAGE
        );
        expect(result.is_messaging).toBe(false);
        expect(result.destination_type).toBe('WEBSITE');
        expect(result.optimization_goal).toBe('LANDING_PAGE_VIEWS');
    });

    it('déduit l\'objectif du type de campagne quand il n\'est pas fourni', () => {
        const result = resolveDestination({ objective: 'OUTCOME_TRAFFIC' }, PAGE);
        expect(result.destination_type).toBe('WEBSITE');
        expect(result.optimization_goal).toBe('LINK_CLICKS');
    });
});

describe('resolveDestination — messagerie', () => {
    it('corrige le payload exact qui a produit l\'erreur #1815675', () => {
        // Reproduction des logs de production : destination Messenger associée à
        // une optimisation LANDING_PAGE_VIEWS et un bouton de site web.
        const result = resolveDestination(
            { destination_type: 'MESSENGER', optimization_goal: 'LANDING_PAGE_VIEWS' },
            PAGE
        );

        expect(result.is_messaging).toBe(true);
        expect(result.destination_type).toBe('MESSENGER');
        // Le point qui faisait tout échouer :
        expect(result.optimization_goal).toBe('CONVERSATIONS');
        expect(result.optimization_goal).not.toBe('LANDING_PAGE_VIEWS');
        expect(result.call_to_action.type).toBe('MESSAGE_PAGE');
    });

    it('gère plusieurs applications cochées', () => {
        const result = resolveDestination(
            { messaging_destinations: ['messenger', 'whatsapp'] },
            PAGE
        );
        expect(result.destination_type).toBe('MESSAGING_MESSENGER_WHATSAPP');
        expect(result.optimization_goal).toBe('CONVERSATIONS');
    });

    it('refuse WhatsApp si aucun numéro n\'est relié, avant tout appel à Meta', () => {
        expect(() => resolveDestination(
            { messaging_destinations: ['whatsapp'] },
            { ...PAGE, whatsapp_connected: false }
        )).toThrow(/WhatsApp Business/);

        // Rien ne doit partir chez Meta : c'est ce qui évite les orphelins.
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('refuse Instagram si aucun compte professionnel n\'est relié', () => {
        expect(() => resolveDestination(
            { messaging_destinations: ['instagram'] },
            { ...PAGE, instagram_connected: false }
        )).toThrow(/Instagram/);
    });

    it('marque l\'erreur comme affichable à l\'utilisateur', () => {
        try {
            resolveDestination({ messaging_destinations: ['instagram'] },
                { ...PAGE, instagram_connected: false });
            throw new Error('aurait dû lever');
        } catch (err) {
            expect(err.userFacing).toBe(true);
            expect(err.validationErrors).toHaveLength(1);
        }
    });

    it('transmet le numéro WhatsApp jusqu\'au promoted_object', () => {
        // Sans lui, Meta ne sait pas quel numéro promouvoir : le sélecteur de
        // numéro reste vide au niveau de la publicité.
        const result = resolveDestination(
            { messaging_destinations: ['whatsapp'], whatsapp_phone_number: '+237 6 50 19 81 96' },
            PAGE
        );
        expect(result.whatsapp_phone_number).toBe('237650198196');

        expect(buildPromotedObject('WHATSAPP', PAGE, result.whatsapp_phone_number))
            .toEqual({ page_id: PAGE.fb_page_id, whatsapp_phone_number: '237650198196' });
    });

    it('n\'ajoute pas de numéro quand WhatsApp n\'est pas visé', () => {
        expect(buildPromotedObject('MESSENGER', { fb_page_id: '1' }))
            .toEqual({ page_id: '1' });
    });
});

describe('getFacebookAccount', () => {
    it('lit les colonnes de rattachement Instagram et WhatsApp', async () => {
        // Sans elles, resolveDestination voit `undefined` et refuse un compte
        // Instagram ou un numéro WhatsApp pourtant bien reliés à la Page.
        let selection = '';
        supabase.from = jest.fn(() => ({
            select: (colonnes) => {
                selection = colonnes;
                return {
                    eq: () => ({
                        eq: () => ({
                            single: () => Promise.resolve({
                                data: { fb_page_id: 'P1', instagram_connected: true },
                                error: null
                            })
                        })
                    })
                };
            }
        }));

        await getFacebookAccount('user-1');

        expect(selection).toMatch(/instagram_connected/);
        expect(selection).toMatch(/whatsapp_connected/);
    });

    it('transmet ces colonnes à la validation des destinations', async () => {
        const compte = await getFacebookAccount('user-1');
        // Le compte remonté doit permettre la validation sans requête de plus.
        expect(compte.instagram_connected).toBe(true);
    });
});

describe('buildPromotedObject', () => {
    it('exige la Page pour toutes les destinations de messagerie', () => {
        const sansNumero = { ...PAGE, whatsapp_number: null };
        ['MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT', 'MESSAGING_MESSENGER_WHATSAPP']
            .forEach(type => {
                expect(buildPromotedObject(type, sansNumero)).toEqual({ page_id: PAGE.fb_page_id });
            });
    });

    it('joint le numéro de la Page quand elle en a un', () => {
        expect(buildPromotedObject('MESSAGING_MESSENGER_WHATSAPP', PAGE))
            .toEqual({ page_id: PAGE.fb_page_id, whatsapp_phone_number: '237650198196' });
    });

    it('n\'ajoute rien pour une destination site web', () => {
        expect(buildPromotedObject('WEBSITE', PAGE)).toBeUndefined();
    });
});

describe('uploadAdImage', () => {
    it('envoie les octets en multipart, pas une URL distante', async () => {
        // Passer { url } à /adimages échoue avec « (#3) Application does not
        // have the capability to make this API call ».
        axios.get.mockResolvedValue({
            data: Buffer.from('fake-png'),
            headers: { 'content-type': 'image/png' }
        });
        axios.post.mockResolvedValue({
            data: { images: { 'creative.png': { hash: 'abc123' } } }
        });

        const hash = await uploadAdImage('act_1', 'token', 'https://cdn.test/img.png');

        expect(hash).toBe('abc123');
        expect(axios.get).toHaveBeenCalledWith('https://cdn.test/img.png',
            expect.objectContaining({ responseType: 'arraybuffer' }));

        const [, body] = axios.post.mock.calls[0];
        expect(body).not.toHaveProperty('url');
        expect(typeof body.getHeaders).toBe('function');
    });

    it('rejette une URL blob: laissée par un aperçu local', async () => {
        await expect(uploadAdImage('act_1', 'token', 'blob:http://localhost:5173/abc'))
            .rejects.toThrow(/téléversé/i);
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('échoue si Meta ne renvoie pas de hash, au lieu de continuer sans visuel', async () => {
        axios.get.mockResolvedValue({ data: Buffer.from('x'), headers: {} });
        axios.post.mockResolvedValue({ data: { images: {} } });

        await expect(uploadAdImage('act_1', 'token', 'https://cdn.test/i.png'))
            .rejects.toThrow(/identifiant/i);
    });
});

describe('rollbackFacebookObjects', () => {
    it('supprime les objets créés, du plus fin au plus large', async () => {
        axios.delete.mockResolvedValue({ data: { success: true } });

        await rollbackFacebookObjects(
            { campaign: 'C1', adset: 'A1', creative: null, ad: null },
            'token'
        );

        const urls = axios.delete.mock.calls.map(([url]) => url);
        expect(urls[0]).toMatch(/A1$/);
        expect(urls[1]).toMatch(/C1$/);
    });

    it('ne touche à rien quand aucun objet n\'a été créé', async () => {
        await rollbackFacebookObjects({ campaign: null, adset: null, creative: null, ad: null }, 't');
        expect(axios.delete).not.toHaveBeenCalled();
    });

    it('n\'éclipse pas l\'erreur d\'origine si l\'annulation échoue', async () => {
        axios.delete.mockRejectedValue(new Error('Meta indisponible'));
        await expect(rollbackFacebookObjects({ campaign: 'C1' }, 'token')).resolves.toBeUndefined();
    });
});
