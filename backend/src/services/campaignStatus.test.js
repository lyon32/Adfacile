jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('./facebookService', () => ({ decryptToken: (t) => t }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('axios');

const axios = require('axios');
const svc = require('./facebookAdsService');
const { supabase } = require('../config/supabase');

const CAMPAGNE = {
    fb_campaign_id: 'C1',
    fb_adset_id: 'A1',
    fb_ad_id: 'AD1'
};

beforeEach(() => {
    jest.clearAllMocks();
    // getFacebookAccount interroge Supabase ; on lui répond un compte valide.
    supabase.from = jest.fn(() => ({
        select: () => ({
            eq: () => ({
                eq: () => ({
                    single: () => Promise.resolve({
                        data: { fb_access_token: 'token', fb_page_id: 'P1', fb_page_name: 'Lyon Deals' },
                        error: null
                    })
                })
            })
        })
    }));
    axios.post.mockResolvedValue({ data: { success: true } });
});

describe('updateCampaignStatus', () => {
    it('propage le statut aux trois niveaux, pas seulement à la campagne', async () => {
        // Activer la seule campagne ne diffuse rien : l'ensemble de publicités
        // et la publicité restent en pause depuis leur création.
        await svc.updateCampaignStatus('user-1', CAMPAGNE, 'active');

        expect(axios.post).toHaveBeenCalledTimes(3);
        const ids = axios.post.mock.calls.map(([url]) => url.split('/').pop());
        expect(ids).toEqual(['C1', 'A1', 'AD1']);
        axios.post.mock.calls.forEach(([, body]) => expect(body.status).toBe('ACTIVE'));
    });

    it('met en pause du plus fin au plus large', async () => {
        await svc.updateCampaignStatus('user-1', CAMPAGNE, 'paused');

        const ids = axios.post.mock.calls.map(([url]) => url.split('/').pop());
        expect(ids).toEqual(['AD1', 'A1', 'C1']);
        axios.post.mock.calls.forEach(([, body]) => expect(body.status).toBe('PAUSED'));
    });

    it('ignore les niveaux absents des campagnes anciennes', async () => {
        await svc.updateCampaignStatus('user-1', { fb_campaign_id: 'C1' }, 'active');
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('remonte l\'échec plutôt que de laisser croire au succès', async () => {
        axios.post.mockRejectedValue(new Error('Meta refuse'));
        await expect(svc.updateCampaignStatus('user-1', CAMPAGNE, 'active'))
            .rejects.toThrow('Meta refuse');
    });
});
