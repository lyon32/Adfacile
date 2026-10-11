/**
 * Service SasPay — encaissement Mobile Money multi-pays
 * AdsFacile Backend
 *
 * Remplace campayService (oct. 2026). Toute règle vient de docs.saspay.me :
 *  - softpay  : POST /payments/softpay/ (push sur le téléphone, ou checkout_url)
 *  - statut   : GET  /payments/{id}/verify/ (revérifie auprès de l'opérateur)
 *  - OTP SMS  : POST /payments/{id}/confirm-otp/
 *  - réseaux  : GET  /pricing/my-rates/ (devise, frais, OTP par pays et réseau)
 *  - webhook  : HMAC-SHA256 hex de `${timestamp}.${corps brut}`, ±5 min
 *
 * Aucune liste de pays ou de réseaux n'est codée ici : elle vient de SasPay.
 */

const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/saspay');
const logger = require('../utils/logger');
const { createTtlCache } = require('../utils/ttlCache');

const UNE_HEURE = 60 * 60 * 1000;
const cache = createTtlCache({ maxEntries: 10 });

const entetes = (extra = {}) => ({
    Authorization: `Bearer ${config.secretKey}`,
    'Content-Type': 'application/json',
    ...extra
});

/** La doc montre des réponses tantôt nues, tantôt dans { success, data }. */
const corpsUtile = (data) => (data && data.data && data.success !== undefined ? data.data : data);

/** Erreur lisible qui garde la réponse SasPay pour le contrôleur. */
function erreurSaspay(err, contexte) {
    const reponse = err.response?.data;
    const detail = reponse?.error?.message || reponse?.message || reponse?.error?.detail || err.message;
    logger.error(`❌ SasPay ${contexte} : ${JSON.stringify(reponse || err.message)}`);
    const e = new Error(detail || `Erreur SasPay (${contexte})`);
    e.status = err.response?.status;
    e.code = reponse?.error?.code || reponse?.code;
    return e;
}

/** Statut SasPay → vocabulaire de la table payments. */
function normalizeStatus(status) {
    switch (String(status || '').toUpperCase()) {
        case 'SUCCESS': return 'successful';
        case 'FAILED':
        case 'CANCELLED': return 'failed';
        default: return 'pending';
    }
}

/**
 * Frais d'encaissement payés par le client (mode ADD_ON), arrondis à l'unité
 * supérieure : ce que l'écran annonce ne doit jamais être inférieur à ce que
 * SasPay débitera.
 */
function computePayinFee(amount, tiers = []) {
    const montant = Number(amount);
    const palier = tiers.find(t =>
        montant >= Number(t.min_amount || 0)
        && (t.max_amount === null || t.max_amount === undefined || montant <= Number(t.max_amount))
    ) || tiers[0];
    if (!palier) return 0;

    let frais = montant * Number(palier.percent || 0) / 100 + Number(palier.fixed || 0);
    if (palier.floor_amount !== null && palier.floor_amount !== undefined) frais = Math.max(frais, Number(palier.floor_amount));
    if (palier.cap_amount !== null && palier.cap_amount !== undefined) frais = Math.min(frais, Number(palier.cap_amount));
    return Math.ceil(frais - 1e-9);
}

/**
 * Pays et réseaux ouverts à l'encaissement pour ce compte marchand.
 * @returns {Promise<Array<{code, name, currency, networks: Array<{code, name, otp_required, otp_instructions, tiers}>}>>}
 */
function listPaymentNetworks() {
    return cache.remember('reseaux', UNE_HEURE, async () => {
        let data;
        try {
            ({ data } = await axios.get(`${config.apiUrl}/pricing/my-rates/`, { headers: entetes() }));
        } catch (err) {
            throw erreurSaspay(err, 'liste des réseaux');
        }

        const pays = new Map();
        for (const r of corpsUtile(data) || []) {
            if (!r.payin?.available) continue;
            if (!pays.has(r.country_code)) {
                pays.set(r.country_code, { code: r.country_code, name: r.country_name, currency: r.currency, networks: [] });
            }
            pays.get(r.country_code).networks.push({
                code: r.network_code,
                name: r.network_name,
                otp_required: !!r.payin.otp_required,
                otp_instructions: r.payin.otp_instructions || '',
                tiers: r.payin.tiers || []
            });
        }
        return [...pays.values()];
    });
}

/** Retrouve un réseau ouvert ; null s'il n'existe pas ou n'encaisse pas. */
async function findNetwork(countryCode, networkCode) {
    const pays = (await listPaymentNetworks()).find(p => p.code === countryCode);
    const reseau = pays?.networks.find(n => n.code === networkCode);
    return reseau ? { country: pays, network: reseau } : null;
}

/**
 * Lance un encaissement.
 * @returns {Promise<{id, status, checkout_url}>}
 */
async function initiatePayment({ amount, currency, country, network, phone, customer = {}, description, externalReference, metadata, otp }) {
    const corps = {
        amount: Number(amount).toFixed(2),
        currency,
        country,
        network,
        description,
        customer: {
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone
        },
        metadata,
        fee_charge_mode: config.feeChargeMode
    };
    if (otp) corps.otp = otp;

    let data;
    try {
        // La référence interne sert de clé d'idempotence : un double clic ou
        // une relance réseau ne crée jamais un second débit.
        ({ data } = await axios.post(`${config.apiUrl}/payments/softpay/`, corps, {
            headers: entetes({ 'Idempotency-Key': externalReference })
        }));
    } catch (err) {
        throw erreurSaspay(err, 'paiement');
    }

    const r = corpsUtile(data);
    logger.info(`💳 SasPay paiement ${r.id} (${country}/${network}) : ${r.status}`);
    return { id: r.id, status: normalizeStatus(r.status), checkout_url: r.checkout_url || '' };
}

/** Statut réel, revérifié par SasPay auprès de l'opérateur. */
async function checkPaymentStatus(paymentId) {
    let data;
    try {
        ({ data } = await axios.get(`${config.apiUrl}/payments/${encodeURIComponent(paymentId)}/verify/`, { headers: entetes() }));
    } catch (err) {
        throw erreurSaspay(err, 'statut');
    }
    const r = corpsUtile(data);
    return {
        id: r.id,
        status: normalizeStatus(r.status),
        raw_status: r.status,
        net_amount: r.net_amount !== undefined ? Number(r.net_amount) : null,
        debited_amount: r.debited_amount !== undefined ? Number(r.debited_amount) : null,
        currency: r.currency
    };
}

/** Code reçu par SMS après la demande de paiement (certains réseaux). */
async function confirmOtp(paymentId, code) {
    try {
        const { data } = await axios.post(
            `${config.apiUrl}/payments/${encodeURIComponent(paymentId)}/confirm-otp/`,
            { otp: code },
            { headers: entetes() }
        );
        const r = corpsUtile(data);
        return { id: r.id || paymentId, status: normalizeStatus(r.status) };
    } catch (err) {
        throw erreurSaspay(err, 'confirmation OTP');
    }
}

/**
 * Vérifie un webhook SasPay sur le corps BRUT reçu.
 * Refuse tout si aucun secret n'est configuré : l'ancien service acceptait
 * alors n'importe quelle requête, donc n'importe qui pouvait activer un plan.
 */
function verifyWebhookSignature(rawBody, signature, timestamp, nowSeconds = Math.floor(Date.now() / 1000), secret = config.webhookSecret) {
    if (!secret || !signature || !timestamp || !rawBody) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > config.webhookToleranceSeconds) return false;

    const attendu = crypto.createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody)))
        .digest('hex');

    const a = Buffer.from(attendu, 'utf8');
    const b = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Référence interne, aussi clé d'idempotence côté SasPay. */
function generateExternalReference() {
    return `ADSFACILE_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = {
    listPaymentNetworks,
    findNetwork,
    initiatePayment,
    checkPaymentStatus,
    confirmOtp,
    verifyWebhookSignature,
    normalizeStatus,
    computePayinFee,
    generateExternalReference,
    _viderCache: () => cache.clear()
};
