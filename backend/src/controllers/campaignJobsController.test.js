/**
 * Création de campagne en deux temps : POST répond 202 avec un identifiant,
 * puis l'écran interroge l'avancement. Voir services/campaignJobs.js.
 */

jest.mock('../config/supabase', () => ({ supabase: {}, supabaseAdmin: {}, serviceRoleConfigured: true }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockCreateFull = jest.fn();
jest.mock('../services/facebookAdsService', () => ({
    createFullCampaign: (...a) => mockCreateFull(...a)
}));

const { supabase } = require('../config/supabase');
const jobs = require('../services/campaignJobs');
const controller = require('./campaignController');

const DONNEES = {
    objective: 'OUTCOME_TRAFFIC',
    campaign_name: 'Test',
    targeting: { locations: [{ key: '1', type: 'city' }], age_min: 18, age_max: 65 },
    daily_budget: 5000,
    destination_type: 'WEBSITE',
    creative: { message: 'Texte', headline: 'Titre', link: 'https://exemple.com' }
};

const reponse = () => {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
};

const requete = (extra = {}) => ({
    user: { id: 'u1', plan: 'pro' },
    body: DONNEES,
    get: (nom) => (extra.headers || {})[nom.toLowerCase()],
    ...extra
});

/** Laisse les promesses en arrière-plan se terminer. */
const attendre = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
    jest.clearAllMocks();
    jobs.reset();
    supabase.from = () => ({
        select: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: 0, error: null }) }) })
    });
});

describe('POST /campaigns — création en deux temps', () => {
    it('répond tout de suite 202 avec un identifiant, sans attendre Meta', async () => {
        mockCreateFull.mockReturnValue(new Promise(() => { /* jamais fini */ }));
        const res = reponse();
        await controller.createCampaign(requete(), res);
        expect(res.code).toBe(202);
        expect(res.corps).toMatchObject({ success: true, data: { job_id: expect.any(String) } });
    });

    it('enregistre le résultat quand la création aboutit', async () => {
        mockCreateFull.mockResolvedValue({ success: true, campaign_id: 'c1', fb_campaign_id: 'f1' });
        const res = reponse();
        await controller.createCampaign(requete(), res);
        await attendre();

        const suivi = reponse();
        await controller.getCreationJob({ user: { id: 'u1' }, params: { id: res.corps.data.job_id } }, suivi);
        expect(suivi.corps.data).toMatchObject({
            status: 'done',
            result: { campaign_id: 'c1', fb_campaign_id: 'f1' }
        });
    });

    it('même clé d\'idempotence : une seule création, même identifiant', async () => {
        mockCreateFull.mockResolvedValue({ campaign_id: 'c1' });
        const headers = { 'idempotency-key': 'abc' };
        const a = reponse();
        const b = reponse();
        await controller.createCampaign(requete({ headers }), a);
        await controller.createCampaign(requete({ headers }), b);
        await attendre();

        expect(mockCreateFull).toHaveBeenCalledTimes(1);
        expect(b.corps.data.job_id).toBe(a.corps.data.job_id);
    });

    it('refuse les données invalides en 400, avant tout travail', async () => {
        const res = reponse();
        await controller.createCampaign(requete({ body: { ...DONNEES, campaign_name: '' } }), res);
        expect(res.code).toBe(400);
        expect(mockCreateFull).not.toHaveBeenCalled();
    });

    it('compte les créations en cours dans la limite du plan', async () => {
        mockCreateFull.mockReturnValue(new Promise(() => {}));
        const libre = reponse();
        await controller.createCampaign(requete({ user: { id: 'u1', plan: 'free' } }), libre);
        expect(libre.code).toBe(202);

        // Le plan gratuit n'autorise qu'une campagne : la seconde, lancée avant
        // que la première soit enregistrée, doit être refusée.
        const seconde = reponse();
        await controller.createCampaign(
            requete({ user: { id: 'u1', plan: 'free' }, headers: { 'idempotency-key': 'autre' } }),
            seconde
        );
        expect(seconde.code).toBe(403);
    });
});

describe('GET /campaigns/jobs/:id', () => {
    it('garde le format d\'erreur actuel quand la création échoue', async () => {
        const err = new Error('Ajoutez une vidéo pour cette publicité');
        err.userFacing = true;
        mockCreateFull.mockRejectedValue(err);
        const res = reponse();
        await controller.createCampaign(requete(), res);
        await attendre();

        const suivi = reponse();
        await controller.getCreationJob({ user: { id: 'u1' }, params: { id: res.corps.data.job_id } }, suivi);
        expect(suivi.corps.data.status).toBe('failed');
        expect(suivi.corps.data.error).toMatchObject({
            error: 'validation_error',
            message: 'Ajoutez une vidéo pour cette publicité',
            details: ['Ajoutez une vidéo pour cette publicité']
        });
        expect(suivi.corps.data.http_status).toBe(400);
    });

    it('traduit une erreur Facebook', async () => {
        const err = new Error('x');
        err.response = { error: { code: 190, message: 'expired' } };
        mockCreateFull.mockRejectedValue(err);
        const res = reponse();
        await controller.createCampaign(requete(), res);
        await attendre();

        const suivi = reponse();
        await controller.getCreationJob({ user: { id: 'u1' }, params: { id: res.corps.data.job_id } }, suivi);
        expect(suivi.corps.data.error.error).toBe('facebook_api_error');
    });

    it('renvoie 404 pour le job d\'un autre utilisateur', async () => {
        mockCreateFull.mockReturnValue(new Promise(() => {}));
        const res = reponse();
        await controller.createCampaign(requete(), res);

        const suivi = reponse();
        await controller.getCreationJob({ user: { id: 'u2' }, params: { id: res.corps.data.job_id } }, suivi);
        expect(suivi.code).toBe(404);
    });

    it('transmet l\'étape en cours', async () => {
        let onStep;
        mockCreateFull.mockImplementation((u, d, opts) => { onStep = opts.onStep; return new Promise(() => {}); });
        const res = reponse();
        await controller.createCampaign(requete(), res);
        onStep('video', { current: 1, total: 2 });

        const suivi = reponse();
        await controller.getCreationJob({ user: { id: 'u1' }, params: { id: res.corps.data.job_id } }, suivi);
        expect(suivi.corps.data).toMatchObject({ status: 'running', step: { name: 'video', current: 1, total: 2 } });
    });
});
