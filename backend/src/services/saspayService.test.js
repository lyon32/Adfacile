/**
 * Tests du service SasPay
 *
 * Règles tirées de docs.saspay.me (webhooks, softpay, my-rates). L'ancien
 * service Campay signait un JSON re-sérialisé (jamais identique aux octets
 * reçus) et acceptait tout webhook quand le secret manquait : ces tests
 * verrouillent l'inverse.
 */

const crypto = require('crypto');

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('axios', () => ({ post: (...a) => mockPost(...a), get: (...a) => mockGet(...a) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

process.env.SASPAY_SECRET_KEY = 'sk_test_cle';
process.env.SASPAY_WEBHOOK_SECRET = 'secret-webhook';

const saspay = require('./saspayService');

const signer = (corps, ts, secret = 'secret-webhook') =>
    crypto.createHmac('sha256', secret).update(`${ts}.${corps}`).digest('hex');

beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    saspay._viderCache();
});

describe('verifyWebhookSignature', () => {
    const corps = '{"event":"transaction.success","data":{"id":"p1"}}';
    const maintenant = 1_800_000_000;

    it('accepte une signature valide sur le corps brut', () => {
        const ts = String(maintenant);
        expect(saspay.verifyWebhookSignature(Buffer.from(corps), signer(corps, ts), ts, maintenant)).toBe(true);
    });

    it('refuse une signature fausse', () => {
        const ts = String(maintenant);
        expect(saspay.verifyWebhookSignature(Buffer.from(corps), 'ab'.repeat(32), ts, maintenant)).toBe(false);
    });

    it('refuse un horodatage de plus de 5 minutes (rejeu)', () => {
        const ts = String(maintenant - 301);
        expect(saspay.verifyWebhookSignature(Buffer.from(corps), signer(corps, ts), ts, maintenant)).toBe(false);
    });

    it('refuse tout si aucun secret n\'est configuré', () => {
        const ts = String(maintenant);
        expect(saspay.verifyWebhookSignature(Buffer.from(corps), signer(corps, ts, ''), ts, maintenant, '')).toBe(false);
    });
});

describe('normalizeStatus', () => {
    it('ramène les statuts SasPay au vocabulaire de la table payments', () => {
        expect(saspay.normalizeStatus('PENDING')).toBe('pending');
        expect(saspay.normalizeStatus('SUCCESS')).toBe('successful');
        expect(saspay.normalizeStatus('FAILED')).toBe('failed');
        expect(saspay.normalizeStatus('CANCELLED')).toBe('failed');
    });
});

describe('computePayinFee', () => {
    const tier = (o) => ({ min_amount: '0.00', max_amount: null, percent: '0', fixed: '0', floor_amount: null, cap_amount: null, ...o });

    it('pourcentage seul (Cameroun 4,5 %)', () => {
        expect(saspay.computePayinFee(5000, [tier({ percent: '4.500' })])).toBe(225);
    });

    it('pourcentage + fixe (Expresso Sénégal 3,75 % + 100)', () => {
        expect(saspay.computePayinFee(5000, [tier({ percent: '3.750', fixed: '100.00' })])).toBe(288);
    });

    it('applique le plancher et le plafond', () => {
        expect(saspay.computePayinFee(100, [tier({ percent: '2.5', floor_amount: '50.00' })])).toBe(50);
        expect(saspay.computePayinFee(1_000_000, [tier({ percent: '2.5', cap_amount: '5000.00' })])).toBe(5000);
    });
});

describe('listPaymentNetworks', () => {
    it('ne garde que les réseaux ouverts à l\'encaissement, groupés par pays', async () => {
        mockGet.mockResolvedValue({ data: [
            { country_code: 'CM', country_name: 'Cameroun', currency: 'XAF', network_code: 'mtn_cm', network_name: 'MTN', payin: { available: true, otp_required: false, otp_instructions: '', tiers: [] } },
            { country_code: 'CM', country_name: 'Cameroun', currency: 'XAF', network_code: 'eu_mobile_cm', network_name: 'EU', payin: { available: false, tiers: [] } },
            { country_code: 'CI', country_name: "Côte d'Ivoire", currency: 'XOF', network_code: 'orange_ci', network_name: 'Orange', payin: { available: true, otp_required: true, otp_instructions: '#144*82#', tiers: [] } }
        ] });

        const pays = await saspay.listPaymentNetworks();

        expect(pays.map(p => p.code)).toEqual(['CM', 'CI']);
        expect(pays[0].networks.map(n => n.code)).toEqual(['mtn_cm']);
        expect(pays[1].networks[0]).toMatchObject({ code: 'orange_ci', otp_required: true, otp_instructions: '#144*82#' });
        expect(mockGet.mock.calls[0][1].headers.Authorization).toBe('Bearer sk_test_cle');
    });

    it('met la liste en cache (un seul appel SasPay)', async () => {
        mockGet.mockResolvedValue({ data: [] });
        await saspay.listPaymentNetworks();
        await saspay.listPaymentNetworks();
        expect(mockGet).toHaveBeenCalledTimes(1);
    });
});

describe('initiatePayment', () => {
    it('envoie softpay avec frais ADD_ON et clé d\'idempotence', async () => {
        mockPost.mockResolvedValue({ data: { id: 'p1', status: 'PENDING', checkout_url: '' } });

        const r = await saspay.initiatePayment({
            amount: 5000, currency: 'XAF', country: 'CM', network: 'mtn_cm', phone: '+237699000000',
            customer: { email: 'a@b.cm', first_name: 'Awa', last_name: 'N' },
            description: 'AdsFacile Starter', externalReference: 'ADSFACILE_1', metadata: { plan: 'starter' }
        });

        const [url, corps, options] = mockPost.mock.calls[0];
        expect(url).toMatch(/\/payments\/softpay\/$/);
        expect(corps).toMatchObject({
            amount: '5000.00', currency: 'XAF', country: 'CM', network: 'mtn_cm', fee_charge_mode: 'ADD_ON',
            customer: { email: 'a@b.cm', first_name: 'Awa', last_name: 'N', phone: '+237699000000' }
        });
        expect(options.headers['Idempotency-Key']).toBe('ADSFACILE_1');
        expect(r).toEqual({ id: 'p1', status: 'pending', checkout_url: '' });
    });

    it('lit aussi une réponse enveloppée dans data', async () => {
        mockPost.mockResolvedValue({ data: { success: true, data: { id: 'p2', status: 'PENDING', checkout_url: 'https://pay' } } });
        const r = await saspay.initiatePayment({ amount: 1, currency: 'XOF', country: 'SN', network: 'wave_sn', phone: '1', customer: {}, externalReference: 'x' });
        expect(r).toEqual({ id: 'p2', status: 'pending', checkout_url: 'https://pay' });
    });
});
