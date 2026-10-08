jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('./facebookService', () => ({ decryptToken: (t) => t }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { insightsTtl } = require('./facebookInsightsService');

describe('insightsTtl', () => {
    it('10 minutes si la période inclut aujourd\'hui (Meta met à jour ~15 min)', () => {
        expect(insightsTtl({ start: '2026-10-01', end: '2026-10-08' }, '2026-10-08')).toBe(10 * 60 * 1000);
    });

    it('6 heures pour une période close, qui ne change plus', () => {
        expect(insightsTtl({ start: '2026-09-01', end: '2026-09-30' }, '2026-10-08')).toBe(6 * 60 * 60 * 1000);
    });
});

describe('getCampaignInsights — compte Facebook', () => {
    // Relevé réel (8 oct. 2026) : avec deux Pages connectées, la requête sans
    // filtre is_active renvoyait deux lignes, .single() échouait et la page
    // Analytics répondait « Compte Facebook non connecté ».
    it('ne lit que la Page active', async () => {
        const { supabase } = require('../config/supabase');
        const filtres = [];
        const chaine = {
            select: () => chaine,
            eq: (col, val) => { filtres.push([col, val]); return chaine; },
            order: () => chaine,
            limit: () => chaine,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null })
        };
        supabase.from = () => chaine;

        const { getCampaignInsights } = require('./facebookInsightsService');
        await expect(getCampaignInsights('u1', 'c1', { start: '2026-10-01', end: '2026-10-08' }))
            .rejects.toThrow();

        expect(filtres).toContainEqual(['is_active', true]);
    });
});
