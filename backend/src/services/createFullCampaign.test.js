jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('./facebookService', () => ({ decryptToken: (t) => t }));
jest.mock('../utils/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));
jest.mock('axios');

const axios = require('axios');
const { supabase } = require('../config/supabase');
const { createFullCampaign } = require('./facebookAdsService');

const COMPTE = {
    fb_access_token: 'TOKEN',
    fb_account_id: '123',
    fb_page_id: '799671609906273',
    fb_page_name: 'Lyon Deals',
    instagram_connected: false,
    whatsapp_connected: true,
    whatsapp_number: '+237650198196'
};

/**
 * Simule Supabase et Graph. Chaque POST est enregistré dans `appels`, indexé
 * par la fin de l'URL (campaigns, adsets, adcreatives, ads, advideos…).
 */
function preparer(compte = COMPTE, reponsesGet = {}) {
    const appels = {};
    supabase.from = jest.fn((table) => {
        if (table === 'facebook_accounts') {
            return {
                select: () => ({
                    eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: compte, error: null }) }) })
                })
            };
        }
        if (table === 'campaigns') {
            return {
                insert: () => ({
                    select: () => ({ single: () => Promise.resolve({ data: { id: 'local-1' }, error: null }) })
                })
            };
        }
        return { insert: () => Promise.resolve({}) };
    });
    axios.get = jest.fn((url) => {
        for (const [motif, data] of Object.entries(reponsesGet)) {
            if (url.includes(motif)) return Promise.resolve({ data, headers: {} });
        }
        return Promise.resolve({ data: { timezone_name: 'Africa/Douala' } });
    });
    axios.post = jest.fn((url, payload) => {
        const cle = url.split('/').pop();
        (appels[cle] = appels[cle] || []).push(payload);
        return Promise.resolve({ data: { id: `${cle}-id`, images: { x: { hash: 'HASH' } } } });
    });
    axios.delete = jest.fn(() => Promise.resolve({}));
    return appels;
}

function donnees(extra = {}) {
    return {
        campaign_name: 'PROD-TEST',
        objective: 'OUTCOME_TRAFFIC',
        destination_type: 'WEBSITE',
        optimization_goal: 'LINK_CLICKS',
        daily_budget: 1000,
        start_date: '2026-10-10',
        targeting: { locations: [{ key: 'CM', type: 'country' }] },
        website_url: 'https://exemple.cm',
        creative: { media_type: 'none', message: 'Bonjour', headline: 'Titre' },
        ...extra
    };
}

beforeEach(() => jest.clearAllMocks());

describe('createFullCampaign — budget', () => {
    it('place le budget quotidien sur l\'ensemble de publicités', async () => {
        const appels = preparer();
        await createFullCampaign('user-1', donnees());
        expect(appels.adsets[0].daily_budget).toBeGreaterThan(0);
    });

    it('ne met aucun budget sur la campagne', async () => {
        // Comportement voulu : budget au niveau de l'ensemble, pas d'Advantage
        // Campaign Budget. Ce test le verrouille.
        const appels = preparer();
        await createFullCampaign('user-1', donnees());
        const campagne = appels.campaigns[0];
        expect(campagne.daily_budget).toBeUndefined();
        expect(campagne.lifetime_budget).toBeUndefined();
        expect(campagne.is_adset_budget_sharing_enabled).toBe(false);
    });
});



/** Réponses Graph d'une vidéo traitée, avec sa miniature préférée. */
function reponsesVideo() {
    return {
        '/thumbnails': { data: [{ uri: 'https://x/autre.jpg', is_preferred: false }, { uri: 'https://x/pref.jpg', is_preferred: true }] },
        '/advideos-id': { status: { video_status: 'ready' } },
        'cdn.test': Buffer.from('octets')
    };
}

describe('createFullCampaign — vidéo seule', () => {
    it('crée une publicité video_data avec la vidéo et sa miniature', async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees({
            creative: { media_type: 'video', media_url: 'https://cdn.test/v.mp4', message: 'Bonjour', headline: 'Titre', description: 'Desc' }
        }));
        expect(appels.advideos).toHaveLength(1);
        const spec = appels.adcreatives[0].object_story_spec;
        expect(spec.link_data).toBeUndefined();
        expect(spec.video_data).toMatchObject({
            video_id: 'advideos-id',
            image_url: 'https://x/pref.jpg',
            message: 'Bonjour',
            title: 'Titre',
            link_description: 'Desc',
            call_to_action: { type: 'LEARN_MORE', value: { link: 'https://exemple.cm' } }
        });
    });
});

describe('createFullCampaign — carrousel', () => {
    const cartes = [
        { url: 'https://cdn.test/1.jpg', type: 'image', name: 'Carte 1', description: 'D1', link: 'https://exemple.cm/1' },
        { url: 'https://cdn.test/2.jpg', type: 'image', name: 'Carte 2' },
        { url: 'https://cdn.test/3.mp4', type: 'video', name: 'Carte 3' }
    ];

    it('envoie une carte par média dans child_attachments', async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees({
            creative: { media_type: 'carousel', media_items: cartes, message: 'Bonjour' }
        }));
        const linkData = appels.adcreatives[0].object_story_spec.link_data;
        expect(linkData.multi_share_optimized).toBe(true);
        expect(linkData.child_attachments).toHaveLength(3);
        expect(linkData.child_attachments[0]).toMatchObject({ name: 'Carte 1', description: 'D1', link: 'https://exemple.cm/1', image_hash: 'HASH' });
        // Lien principal par défaut quand la carte n'en a pas.
        expect(linkData.child_attachments[1].link).toBe('https://exemple.cm');
        // Une carte vidéo exige aussi une image : la miniature.
        expect(linkData.child_attachments[2]).toMatchObject({ video_id: 'advideos-id', picture: 'https://x/pref.jpg' });
    });

    it('met le bouton Appeler sur chaque carte pour une destination Appels', async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees({
            objective: 'OUTCOME_TRAFFIC',
            destination_type: 'PHONE_CALL',
            optimization_goal: 'QUALITY_CALL',
            phone_number: '+237650198196',
            creative: { media_type: 'carousel', media_items: cartes.slice(0, 2) }
        }));
        const linkData = appels.adcreatives[0].object_story_spec.link_data;
        for (const carte of linkData.child_attachments) {
            expect(carte.call_to_action.type).toBe('CALL_NOW');
        }
    });
});

const MEDIAS_FLEXIBLES = [
    { url: 'https://cdn.test/1.jpg', type: 'image' },
    { url: 'https://cdn.test/2.jpg', type: 'image' },
    { url: 'https://cdn.test/3.jpg', type: 'image' },
    { url: 'https://cdn.test/4.mp4', type: 'video' }
];

const CREATIVE_FLEXIBLE = {
    media_type: 'flexible',
    media_items: MEDIAS_FLEXIBLES,
    message: 'Texte 1',
    bodies: ['Texte 2'],
    headline: 'Titre 1',
    titles: ['Titre 2'],
    description: 'Desc'
};

describe('createFullCampaign — plusieurs visuels : contenu dynamique (Trafic, etc.)', () => {
    it("crée l'ensemble en mode dynamique", async () => {
        // Meta refuse sinon : « les publicités à contenu dynamique ne peuvent
        // être créées que dans des ensembles à contenu dynamique ».
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees({ creative: CREATIVE_FLEXIBLE }));
        expect(appels.adsets[0].is_dynamic_creative).toBe(true);
    });

    it('décrit les médias dans asset_feed_spec avec AUTOMATIC_FORMAT', async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees({ creative: CREATIVE_FLEXIBLE }));
        const creation = appels.adcreatives[0];
        expect(creation.object_story_spec.link_data).toBeUndefined();
        expect(creation.object_story_spec.page_id).toBe(COMPTE.fb_page_id);
        const feed = creation.asset_feed_spec;
        expect(feed.ad_formats).toEqual(['AUTOMATIC_FORMAT']);
        expect(feed.images).toHaveLength(3);
        expect(feed.videos).toEqual([{ video_id: 'advideos-id', thumbnail_url: 'https://x/pref.jpg' }]);
        expect(feed.bodies).toEqual([{ text: 'Texte 1' }, { text: 'Texte 2' }]);
        expect(feed.titles).toEqual([{ text: 'Titre 1' }, { text: 'Titre 2' }]);
        expect(feed.link_urls).toEqual([{ website_url: 'https://exemple.cm' }]);
        expect(feed.call_to_action_types).toEqual(['LEARN_MORE']);
    });

    it("ne rend pas dynamique un ensemble qui n'a pas ce format", async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees());
        expect(appels.adsets[0].is_dynamic_creative).toBeUndefined();
    });
});

describe('createFullCampaign — plusieurs visuels : vrai format flexible (Ventes)', () => {
    const ventes = () => donnees({
        objective: 'OUTCOME_SALES',
        pixel_id: '1234567890',
        creative: CREATIVE_FLEXIBLE
    });

    it('envoie creative_asset_groups_spec avec la publicité, pas asset_feed_spec', async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', ventes());

        expect(appels.adsets[0].is_dynamic_creative).toBeUndefined();
        const pub = appels.ads[0];
        const [groupe] = pub.creative_asset_groups_spec.groups;
        expect(groupe.images).toHaveLength(3);
        expect(groupe.videos).toEqual([{ video_id: 'advideos-id' }]);
        expect(groupe.texts).toEqual(expect.arrayContaining([
            { text: 'Texte 1', text_type: 'primary_text' },
            { text: 'Texte 2', text_type: 'primary_text' },
            { text: 'Titre 1', text_type: 'headline' },
            { text: 'Titre 2', text_type: 'headline' }
        ]));
        expect(groupe.call_to_action).toEqual({ type: 'LEARN_MORE', value: { link: 'https://exemple.cm' } });
        // La création est passée en ligne, avec la seule Page.
        expect(pub.creative.asset_feed_spec).toBeUndefined();
        expect(pub.creative.object_story_spec.page_id).toBe(COMPTE.fb_page_id);
        // Meta refuse sinon : « Le champ link est requis » (relevé en réel).
        // Le premier média du groupe doit aussi être celui de la création.
        expect(pub.creative.object_story_spec.link_data)
            .toMatchObject({ link: 'https://exemple.cm', image_hash: 'HASH' });
        expect(appels.adcreatives).toBeUndefined();
    });
});

describe('createFullCampaign — flexible (Ventes) dont le premier média est une vidéo', () => {
    it('met cette vidéo dans video_data de la création', async () => {
        const appels = preparer(COMPTE, reponsesVideo());
        await createFullCampaign('user-1', donnees({
            objective: 'OUTCOME_SALES',
            pixel_id: '1234567890',
            creative: {
                ...CREATIVE_FLEXIBLE,
                media_items: [
                    { url: 'https://cdn.test/4.mp4', type: 'video' },
                    { url: 'https://cdn.test/1.jpg', type: 'image' }
                ]
            }
        }));
        const spec = appels.ads[0].creative.object_story_spec;
        expect(spec.link_data).toBeUndefined();
        expect(spec.video_data).toMatchObject({ video_id: 'advideos-id', image_url: 'https://x/pref.jpg' });
    });
});

describe('createFullCampaign — numéro WhatsApp dans l\'identité', () => {
    const creationsExistantes = {
        '/adcreatives': {
            data: [
                { object_story_spec: { page_id: COMPTE.fb_page_id }, wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'WA-1' } },
                { object_story_spec: { page_id: COMPTE.fb_page_id }, wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'WA-1' } },
                { object_story_spec: { page_id: 'AUTRE-PAGE' }, wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'WA-AUTRE' } },
                { object_story_spec: { page_id: COMPTE.fb_page_id } }
            ]
        }
    };

    it.each([
        ['site web', {}],
        ['appels', { destination_type: 'PHONE_CALL', optimization_goal: 'QUALITY_CALL', phone_number: '+237650198196' }],
        ['messagerie', { objective: 'OUTCOME_ENGAGEMENT', destination_type: 'WHATSAPP', optimization_goal: 'CONVERSATIONS' }]
    ])('reprend l\'identité WhatsApp de la Page sur une publicité %s', async (_, extra) => {
        const appels = preparer(COMPTE, creationsExistantes);
        await createFullCampaign('user-1', donnees(extra));
        const creation = appels.adcreatives?.[0] || appels.ads[0].creative;
        expect(creation.wamo_whatsapp_identity_spec).toEqual({ wamo_whatsapp_identity_id: 'WA-1' });
    });

    it('n\'ajoute rien quand la Page n\'a pas d\'identité WhatsApp connue', async () => {
        const appels = preparer(COMPTE, { '/adcreatives': { data: [] } });
        await createFullCampaign('user-1', donnees());
        expect(appels.adcreatives[0].wamo_whatsapp_identity_spec).toBeUndefined();
    });

    it('ne bloque pas la création si la lecture échoue', async () => {
        const appels = preparer();
        const get = axios.get;
        axios.get = jest.fn((url, o) => (url.includes('/adcreatives') ? Promise.reject(new Error('réseau')) : get(url, o)));
        await createFullCampaign('user-1', donnees());
        expect(appels.ads).toHaveLength(1);
    });
});
