jest.mock('../config/supabase', () => ({ supabase: {} }));
jest.mock('../services/facebookAdsService', () => ({}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { minDailyBudgetFcfa } = require('../utils/currency');

/**
 * validateCampaignData n'est pas exporté : on le rejoue via le module, en
 * important le contrôleur pour ses effets de bord de chargement, puis en
 * reconstruisant l'appel par le chemin public le plus proche.
 *
 * Plutôt que d'exporter une fonction interne pour les besoins du test, on
 * reproduit ici les mêmes règles sur des jeux de données représentatifs, à
 * travers le contrôleur réel.
 */
const controller = require('./campaignController');

// Campagne minimale valide, servant de base aux variantes.
const BASE = {
    objective: 'OUTCOME_TRAFFIC',
    campaign_name: 'Campagne test',
    targeting: { locations: [{ key: '1', type: 'city' }], age_min: 18, age_max: 65 },
    daily_budget: 5000,
    destination_type: 'WEBSITE',
    creative: { message: 'Texte', headline: 'Titre', link: 'https://exemple.com' }
};

/** Rejoue la validation en passant par le contrôleur, et récupère les erreurs. */
async function valider(payload) {
    let capture = null;
    const req = { user: { id: 'u1', plan: 'pro' }, body: payload };
    const res = {
        status(code) { this._code = code; return this; },
        json(corps) { capture = { code: this._code || 200, corps }; return this; }
    };

    // checkCampaignLimit interroge Supabase ; on le neutralise.
    const { supabase } = require('../config/supabase');
    supabase.from = () => ({
        select: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: 0, error: null }) }) })
    });

    await controller.createCampaign(req, res);
    return capture;
}

describe('validation de campagne — règles auparavant absentes', () => {
    it('refuse un âge minimum supérieur au maximum', async () => {
        const r = await valider({
            ...BASE,
            targeting: { ...BASE.targeting, age_min: 60, age_max: 20 }
        });
        expect(r.code).toBe(400);
        expect(r.corps.details.join(' ')).toMatch(/âge minimum ne peut pas dépasser/i);
    });

    it('refuse une date de fin antérieure au début', async () => {
        const r = await valider({
            ...BASE,
            start_date: '2026-09-10',
            end_date: '2026-09-01'
        });
        expect(r.code).toBe(400);
        expect(r.corps.details.join(' ')).toMatch(/postérieure/i);
    });

    it('exige une date de fin avec un budget total', async () => {
        // Meta refuse un lifetime_budget sans end_time ; le service échouait
        // après avoir créé la campagne.
        const r = await valider({ ...BASE, budget_type: 'lifetime', end_date: null });
        expect(r.code).toBe(400);
        expect(r.corps.details.join(' ')).toMatch(/date de fin/i);
    });

    it('emploie le minimum de budget réellement appliqué, pas 1000 en dur', async () => {
        const r = await valider({ ...BASE, daily_budget: 1 });
        expect(r.code).toBe(400);
        expect(r.corps.details.join(' ')).toContain(String(minDailyBudgetFcfa()));
    });

    it('n\'exige pas de titre pour une publicité de messagerie', async () => {
        const r = await valider({
            ...BASE,
            destination_type: 'MESSENGER',
            messaging_destinations: ['messenger'],
            creative: { message: 'Texte', headline: '', link: '' }
        });
        // La validation locale doit passer : l'échec éventuel vient ensuite de
        // Facebook, pas d'une exigence que Meta ne formule pas.
        if (r.code === 400 && r.corps.error === 'validation_error') {
            expect(r.corps.details.join(' ')).not.toMatch(/titre/i);
        }
    });

    it('exige toujours un titre pour une publicité vers un site web', async () => {
        const r = await valider({
            ...BASE,
            creative: { ...BASE.creative, headline: '' }
        });
        expect(r.code).toBe(400);
        expect(r.corps.details.join(' ')).toMatch(/titre/i);
    });
});
