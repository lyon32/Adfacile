/**
 * Webhook SasPay — idempotence et signature
 *
 * SasPay renvoie un webhook jusqu'à 5 fois. L'ancien code CamPay réactivait le
 * plan (et repoussait l'expiration) à chaque réception : rejouer un webhook
 * offrait des mois gratuits. Ces tests verrouillent une activation unique.
 */

const crypto = require('crypto');

process.env.SASPAY_SECRET_KEY = 'sk_test_cle';
process.env.SASPAY_WEBHOOK_SECRET = 'secret-webhook';

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockEtat = { paiement: null, activations: 0, finalisations: 0 };

/** Supabase simulé : payments (lecture + mise à jour conditionnelle) et users. */
function mockFabriqueSupabase() {
    return {
        from: (table) => {
            const filtres = {};
            let maj = null;
            const chaine = {
                select: () => chaine,
                insert: () => chaine,
                update: (v) => { maj = v; return chaine; },
                eq: (col, val) => { filtres[col] = val; return chaine; },
                maybeSingle: async () => {
                    const p = mockEtat.paiement;
                    const ok = p && Object.entries(filtres).every(([c, v]) => p[c] === v);
                    return { data: ok ? { ...p } : null, error: null };
                },
                then: (resolve) => {
                    if (table === 'payments' && maj) {
                        const p = mockEtat.paiement;
                        const ok = Object.entries(filtres).every(([c, v]) => p[c] === v);
                        if (ok) { Object.assign(p, maj); mockEtat.finalisations++; }
                        return Promise.resolve({ data: ok ? [{ id: p.id }] : [], error: null }).then(resolve);
                    }
                    if (table === 'users' && maj) {
                        mockEtat.activations++;
                        return Promise.resolve({ data: [{ id: 'u1', plan: maj.plan }], error: null }).then(resolve);
                    }
                    return Promise.resolve({ data: null, error: null }).then(resolve);
                }
            };
            return chaine;
        }
    };
}

jest.mock('../config/supabase', () => ({ supabase: mockFabriqueSupabase(), supabaseAdmin: mockFabriqueSupabase() }));

const { handleWebhook } = require('./billingController');

const reponse = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

function requete(corps, secret = 'secret-webhook') {
    const brut = Buffer.from(JSON.stringify(corps));
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.`).update(brut).digest('hex');
    return { body: brut, headers: { 'x-webhook-signature': sig, 'x-webhook-timestamp': ts } };
}

beforeEach(() => {
    mockEtat.paiement = { id: 'pay-1', user_id: 'u1', target_plan: 'starter', status: 'pending', provider: 'saspay', provider_reference: 'sp-1' };
    mockEtat.activations = 0;
    mockEtat.finalisations = 0;
});

describe('handleWebhook SasPay', () => {
    const succes = { event: 'transaction.success', data: { id: 'sp-1', status: 'SUCCESS' } };

    it('active le plan une seule fois même si SasPay renvoie le webhook', async () => {
        await handleWebhook(requete(succes), reponse());
        await handleWebhook(requete(succes), reponse());
        await handleWebhook(requete(succes), reponse());

        expect(mockEtat.paiement.status).toBe('successful');
        expect(mockEtat.activations).toBe(1);
    });

    it('refuse une signature fausse sans rien modifier', async () => {
        const res = reponse();
        await handleWebhook(requete(succes, 'mauvais-secret'), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockEtat.paiement.status).toBe('pending');
        expect(mockEtat.activations).toBe(0);
    });

    it('un échec marque le paiement failed sans activer le plan', async () => {
        await handleWebhook(requete({ event: 'transaction.failed', data: { id: 'sp-1', status: 'FAILED' } }), reponse());
        expect(mockEtat.paiement.status).toBe('failed');
        expect(mockEtat.activations).toBe(0);
    });

    it('ignore un paiement inconnu avec 200 (pas de renvoi inutile)', async () => {
        const res = reponse();
        await handleWebhook(requete({ event: 'transaction.success', data: { id: 'autre', status: 'SUCCESS' } }), res);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0]).toMatchObject({ ignored: 'unknown_payment' });
    });
});
