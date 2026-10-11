jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/facebookAdsService', () => ({
    deleteCampaignOnFacebook: jest.fn().mockResolvedValue({ deleted: true })
}));

const facebookAdsService = require('../services/facebookAdsService');
const { supabase } = require('../config/supabase');
const controller = require('./campaignController');

const CAMPAGNE = {
    id: 'c-1',
    fb_campaign_id: '120255687775970583',
    fb_adset_id: 'A1',
    fb_ad_id: 'AD1'
};

let supprimeeEnBase;

function monterSupabase({ campagne = CAMPAGNE, erreurSuppression = null } = {}) {
    supprimeeEnBase = false;
    supabase.from = jest.fn((table) => {
        if (table === 'audit_logs') {
            // Le vrai constructeur Supabase est « thenable » mais n'expose pas
            // .catch : l'appeler ainsi lève « .catch is not a function ».
            return { insert: () => Promise.resolve({ error: null }) };
        }
        return {
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        single: () => Promise.resolve({ data: campagne, error: null })
                    })
                })
            }),
            delete: () => ({
                eq: () => ({
                    eq: () => {
                        supprimeeEnBase = true;
                        return Promise.resolve({ error: erreurSuppression });
                    }
                })
            })
        };
    });
}

function faireReponse() {
    return {
        _code: 200,
        status(c) { this._code = c; return this; },
        json(corps) { this._corps = corps; return this; }
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    facebookAdsService.deleteCampaignOnFacebook.mockResolvedValue({ deleted: true });
});

describe('deleteCampaign', () => {
    it('supprime la campagne chez Facebook, pas seulement en base', async () => {
        // Sans cela, une campagne « supprimée » disparaît du tableau de bord
        // mais continue d'exister chez Meta — et de dépenser si elle diffuse.
        monterSupabase();
        const res = faireReponse();

        await controller.deleteCampaign({ params: { id: 'c-1' }, user: { id: 'u1' } }, res);

        expect(facebookAdsService.deleteCampaignOnFacebook).toHaveBeenCalledTimes(1);
        expect(res._code).toBe(200);
        expect(res._corps.success).toBe(true);
    });

    it('supprime chez Facebook AVANT la base', async () => {
        // L'inverse laisserait un orphelin invisible si Meta refusait.
        monterSupabase();
        let ordreRespecte = false;
        facebookAdsService.deleteCampaignOnFacebook.mockImplementation(async () => {
            ordreRespecte = supprimeeEnBase === false;
            return { deleted: true };
        });

        await controller.deleteCampaign({ params: { id: 'c-1' }, user: { id: 'u1' } }, faireReponse());
        expect(ordreRespecte).toBe(true);
    });

    it('ne plante pas sur le journal d\'audit', async () => {
        // « supabase.from(...).insert(...).catch is not a function » renvoyait
        // une erreur 500 alors que la suppression avait déjà eu lieu.
        monterSupabase();
        const res = faireReponse();

        await controller.deleteCampaign({ params: { id: 'c-1' }, user: { id: 'u1' } }, res);

        expect(res._corps.message).not.toMatch(/Erreur serveur/);
        expect(res._code).toBe(200);
    });

    it('renonce si Facebook refuse, plutôt que de supprimer la trace locale', async () => {
        monterSupabase();
        facebookAdsService.deleteCampaignOnFacebook.mockRejectedValue(new Error('Meta refuse'));
        const res = faireReponse();

        await controller.deleteCampaign({ params: { id: 'c-1' }, user: { id: 'u1' } }, res);

        expect(supprimeeEnBase).toBe(false);
        expect(res._code).toBe(400);
    });

    it('supprime en base une campagne sans identifiant Facebook', async () => {
        // Campagne jamais créée chez Meta : rien à supprimer là-bas.
        monterSupabase({ campagne: { id: 'c-2', fb_campaign_id: null } });
        const res = faireReponse();

        await controller.deleteCampaign({ params: { id: 'c-2' }, user: { id: 'u1' } }, res);

        expect(facebookAdsService.deleteCampaignOnFacebook).not.toHaveBeenCalled();
        expect(supprimeeEnBase).toBe(true);
        expect(res._code).toBe(200);
    });
});
