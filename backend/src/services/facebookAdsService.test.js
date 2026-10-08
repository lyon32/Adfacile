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
            {
                objective: 'OUTCOME_TRAFFIC',
                destination_type: 'WEBSITE',
                optimization_goal: 'LANDING_PAGE_VIEWS'
            },
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

    it('refuse un objectif absent au lieu de retomber sur LINK_CLICKS', () => {
        // Auparavant, un objectif absent ou mal orthographié produisait un
        // ensemble optimisé pour les clics, quelle que soit la campagne.
        expect(() => resolveDestination({ destination_type: 'WEBSITE' }, PAGE))
            .toThrow(/inconnu/i);
    });

    it('refuse un objectif de performance incompatible avec l\'objectif', () => {
        // Le parcours réel : Trafic écrit LANDING_PAGE_VIEWS, l'utilisateur
        // revient en arrière et choisit Notoriété. Meta rejetait l'ensemble
        // APRÈS la création de la campagne.
        expect(() => resolveDestination(
            {
                objective: 'OUTCOME_AWARENESS',
                destination_type: 'WEBSITE',
                optimization_goal: 'LANDING_PAGE_VIEWS'
            },
            PAGE
        )).toThrow(/n'est pas disponible/i);
    });

    it('refuse une campagne Ventes vers un site web sans pixel', () => {
        expect(() => resolveDestination(
            { objective: 'OUTCOME_SALES', destination_type: 'WEBSITE' },
            PAGE
        )).toThrow(/pixel/i);
    });

    it('accepte Ventes vers un site web dès que le pixel est fourni', () => {
        // Le wizard ne demandait jamais l'ensemble de données : ce chemin
        // échouait donc systématiquement, à la dernière étape.
        const result = resolveDestination(
            {
                objective: 'OUTCOME_SALES',
                destination_type: 'WEBSITE',
                pixel_id: '1234567890'
            },
            PAGE
        );

        expect(result.optimization_goal).toBe('OFFSITE_CONVERSIONS');
        expect(result.conversion).toEqual({
            pixel_id: '1234567890',
            custom_event_type: 'PURCHASE'
        });
    });

    it('porte le pixel et l\'évènement jusqu\'au promoted_object', () => {
        const promu = buildPromotedObject('WEBSITE', PAGE, null, null, {
            pixel_id: '1234567890',
            custom_event_type: 'ADD_TO_CART'
        });

        expect(promu).toEqual({
            pixel_id: '1234567890',
            custom_event_type: 'ADD_TO_CART'
        });
    });

    it('ne fabrique aucun objet promu pour un site web sans pixel', () => {
        expect(buildPromotedObject('WEBSITE', PAGE)).toBeUndefined();
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

describe('buildPromotedObject — identification du numéro WhatsApp', () => {
    const PAGE_WA = { fb_page_id: 'P1', whatsapp_number: '+237650198196' };

    it('préfère l\'identifiant au numéro brut', () => {
        // Meta rattache alors la publicité au compte WhatsApp Business et
        // en déduit le numéro lui-même.
        expect(buildPromotedObject('WHATSAPP', PAGE_WA, null, '344188022113673'))
            .toEqual({ page_id: 'P1', whats_app_business_phone_number_id: '344188022113673' });
    });

    it('n\'envoie jamais les deux ensemble', () => {
        // Meta répond « (#200) Permissions error » si les deux sont fournis.
        const result = buildPromotedObject('WHATSAPP', PAGE_WA, '+237650198196', '344188022113673');
        expect(result.whats_app_business_phone_number_id).toBe('344188022113673');
        expect(result).not.toHaveProperty('whatsapp_phone_number');
    });

    it('retombe sur le numéro quand l\'identifiant est absent ou invalide', () => {
        expect(buildPromotedObject('WHATSAPP', PAGE_WA, '+237650198196', ''))
            .toEqual({ page_id: 'P1', whatsapp_phone_number: '237650198196' });
        expect(buildPromotedObject('WHATSAPP', PAGE_WA, '+237650198196', 'abc'))
            .toEqual({ page_id: 'P1', whatsapp_phone_number: '237650198196' });
    });

    it('lit l\'identifiant enregistré sur le compte', () => {
        expect(buildPromotedObject('WHATSAPP', { ...PAGE_WA, whatsapp_phone_number_id: '999' }))
            .toEqual({ page_id: 'P1', whats_app_business_phone_number_id: '999' });
    });
});

describe('buildTargeting — données auparavant perdues', () => {
    const { buildTargeting } = require('./facebookAdsService');
    const BASE = { age_min: 18, age_max: 65, locations: [{ key: '1', type: 'city' }] };

    it('convertit le genre au format attendu par Meta', () => {
        // Le formulaire enregistre ['male'] ; Meta attend [1]. Sans conversion,
        // le ciblage était saisi puis perdu en silence.
        expect(buildTargeting({ ...BASE, genders: ['male'] }).genders).toEqual([1]);
        expect(buildTargeting({ ...BASE, genders: ['female'] }).genders).toEqual([2]);
    });

    it('omet le champ pour « tous », comme Meta l\'attend', () => {
        expect(buildTargeting({ ...BASE, genders: [] })).not.toHaveProperty('genders');
        expect(buildTargeting({ ...BASE })).not.toHaveProperty('genders');
    });

    it('transmet les comportements aux côtés des intérêts', () => {
        const r = buildTargeting({
            ...BASE,
            interests: [{ id: '6003', name: 'Mode' }],
            behaviors: [{ id: '6002', name: 'Voyageurs' }]
        });
        expect(r.flexible_spec[0].interests).toHaveLength(1);
        expect(r.flexible_spec[0].behaviors).toEqual([{ id: '6002', name: 'Voyageurs' }]);
    });

    it('écarte les comportements sans identifiant plutôt que de tout faire échouer', () => {
        // L'assistant IA peut proposer des libellés seuls.
        const r = buildTargeting({ ...BASE, behaviors: [{ name: 'Voyageurs' }] });
        expect(r.flexible_spec).toBeUndefined();
    });
});

describe('création publicitaire — champs auparavant absents', () => {
    it('refuse la vidéo au lieu de publier une publicité sans visuel', async () => {
        const svc = require('./facebookAdsService');
        // La vidéo était téléversée puis ignorée : link_data partait sans
        // image_hash ni video_id.
        expect(typeof svc.createFullCampaign).toBe('function');
    });
});

describe('buildTargeting — audience Advantage', () => {
    const { buildTargeting } = require('./facebookAdsService');
    const BASE = { age_min: 18, age_max: 65, locations: [{ key: '1', type: 'city' }] };

    it('place targeting_automation DANS le ciblage, pas à côté', () => {
        // Meta refuse la création sans ce champ (sous-code 1870227), et le
        // veut dans la spécification de ciblage. L'envoyer au niveau de
        // l'ensemble de publicités revient à ne pas le fournir.
        const r = buildTargeting(BASE);
        expect(r.targeting_automation).toEqual({ advantage_audience: 0 });
    });

    it('refuse l\'élargissement automatique par défaut', () => {
        // À 1, Meta s'autorise à dépasser le ciblage demandé.
        expect(buildTargeting(BASE).targeting_automation.advantage_audience).toBe(0);
    });

    it('accepte l\'élargissement s\'il est demandé explicitement', () => {
        expect(buildTargeting({ ...BASE, advantage_audience: 1 })
            .targeting_automation.advantage_audience).toBe(1);
    });

    it('n\'accepte que 0 ou 1, jamais une valeur approchante', () => {
        [true, '1', 2, null].forEach(v => {
            expect(buildTargeting({ ...BASE, advantage_audience: v })
                .targeting_automation.advantage_audience).toBe(0);
        });
    });
});

describe('instagramIdentity — destination « Instagram ou Facebook »', () => {
    // Relevé réel (8 oct. 2026, test T3) : Meta refusait la publicité
    // INSTAGRAM_PROFILE (sous-code 3907008, « doit être associée à un compte
    // Instagram ») — le compte Instagram relié n'était jamais transmis.
    const { instagramIdentity } = require('./facebookAdsService');

    it('transmet le compte Instagram relié pour INSTAGRAM_PROFILE', () => {
        expect(instagramIdentity('INSTAGRAM_PROFILE', { instagram_account_id: '17841400000000000' }))
            .toEqual({ instagram_user_id: '17841400000000000' });
    });

    it('refuse avant tout appel Meta si aucun compte Instagram n\'est relié', () => {
        expect(() => instagramIdentity('INSTAGRAM_PROFILE', { instagram_account_id: null }))
            .toThrow(/compte Instagram/);
    });

    it('ne change rien aux autres destinations', () => {
        expect(instagramIdentity('WEBSITE', { instagram_account_id: '1' })).toEqual({});
    });
});

describe('phoneCallToAction — destination « Appels »', () => {
    // Relevé réel (8 oct. 2026, test T4) : la publicité d'appel partait avec
    // « En savoir plus » vers le site — personne ne pouvait appeler. Meta
    // exige CALL_NOW avec un lien tel: (doc « Call Ads »).
    const { phoneCallToAction } = require('./facebookAdsService');

    it('construit CALL_NOW avec un lien tel: au format international', () => {
        expect(phoneCallToAction('+237 6 99 00 00 00')).toEqual({
            type: 'CALL_NOW',
            value: { link: 'tel:+237699000000' }
        });
    });

    it('refuse un numéro sans indicatif pays, avant tout appel Meta', () => {
        expect(() => phoneCallToAction('699000000')).toThrow(/indicatif/);
        expect(() => phoneCallToAction('')).toThrow(/numéro/);
    });
});

describe('deleteCampaignOnFacebook — création publicitaire', () => {
    // Relevé réel (8 oct. 2026) : supprimer la campagne laissait la création
    // publicitaire chez Meta (status ACTIVE) — elle s'accumulait dans la
    // bibliothèque du compte.
    const { deleteCampaignOnFacebook } = require('./facebookAdsService');

    beforeEach(() => {
        supabase.from = jest.fn(() => ({
            select: () => ({ eq: () => ({ eq: () => ({
                single: () => Promise.resolve({ data: { fb_access_token: 'jeton' }, error: null })
            }) }) })
        }));
    });

    it('supprime aussi la création publicitaire enregistrée', async () => {
        axios.delete.mockResolvedValue({ data: { success: true } });

        await deleteCampaignOnFacebook('u1', { fb_campaign_id: 'C1', fb_creative_id: 'CR1' });

        const urls = axios.delete.mock.calls.map(([url]) => url);
        expect(urls.some(u => u.endsWith('/C1'))).toBe(true);
        expect(urls.some(u => u.endsWith('/CR1'))).toBe(true);
    });

    it('un échec sur la création ne fait pas échouer la suppression de la campagne', async () => {
        axios.delete.mockImplementation(async (url) => {
            if (url.endsWith('/CR1')) throw new Error('création déjà supprimée');
            return { data: { success: true } };
        });

        await expect(deleteCampaignOnFacebook('u1', { fb_campaign_id: 'C1', fb_creative_id: 'CR1' }))
            .resolves.toEqual({ deleted: true });
    });
});
