/**
 * CamPay Service — Mobile Money Payment Integration
 * AdsFacile Backend
 *
 * API Reference: https://demo.campay.net/api/docs/
 * - POST /token/          → Get auth token
 * - POST /collect/        → Initiate collection (payment from user)
 * - GET  /transaction/:ref → Check transaction status
 */

const axios = require('axios');
const crypto = require('crypto');
const campayConfig = require('../config/campay');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtenir un token d'authentification CamPay
 * Le token est valide pour une durée limitée
 */
async function getAccessToken() {
    try {
        const response = await axios.post(`${campayConfig.apiUrl}/token/`, {
            username: campayConfig.appUsername,
            password: campayConfig.appPassword
        });

        return response.data.token;
    } catch (error) {
        logger.error('❌ CamPay auth error:', error.response?.data || error.message);
        throw new Error('Erreur authentification CamPay');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT COLLECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initier un paiement Mobile Money via CamPay
 *
 * @param {Object} params
 * @param {number} params.amount - Montant en XAF
 * @param {string} params.phone - Numéro au format +237XXXXXXXXX
 * @param {string} params.description - Description du paiement
 * @param {string} params.externalReference - Notre référence interne unique
 * @returns {Object} { success, reference, status, operator, ussd_code }
 */
async function initiatePayment({ amount, phone, description, externalReference }) {
    try {
        // Validation sandbox: montant max
        if (campayConfig.env === 'sandbox' && amount > campayConfig.maxTestAmount) {
            logger.warn(`⚠️ Sandbox: montant ${amount} réduit à ${campayConfig.maxTestAmount} XAF`);
            amount = campayConfig.maxTestAmount;
        }

        // Valider format numéro (+237XXXXXXXXX)
        if (!phone.match(/^\+237\d{9}$/)) {
            throw new Error('Format numéro invalide (attendu: +237XXXXXXXXX)');
        }

        const token = await getAccessToken();

        logger.info(`💳 CamPay collect: ${amount} XAF → ${phone} (ref: ${externalReference})`);

        const response = await axios.post(
            `${campayConfig.apiUrl}/collect/`,
            {
                amount: amount.toString(),
                currency: 'XAF',
                from: phone,
                description: description,
                external_reference: externalReference
            },
            {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logger.info(`✅ CamPay collect initiated: ref=${response.data.reference}, status=${response.data.status}`);

        return {
            success: true,
            reference: response.data.reference,
            status: response.data.status, // PENDING initially
            operator: response.data.operator, // MTN ou ORANGE
            ussd_code: response.data.ussd_code, // Code USSD si disponible
            external_reference: externalReference
        };

    } catch (error) {
        logger.error('❌ CamPay initiate payment error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message || 'Erreur initiation paiement');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTION STATUS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifier le statut d'un paiement via CamPay
 *
 * @param {string} reference - Référence CamPay de la transaction
 * @returns {Object} { reference, status, amount, operator, reason }
 */
async function checkPaymentStatus(reference) {
    try {
        const token = await getAccessToken();

        const response = await axios.get(
            `${campayConfig.apiUrl}/transaction/${reference}/`,
            {
                headers: {
                    'Authorization': `Token ${token}`
                }
            }
        );

        return {
            reference: response.data.reference,
            status: response.data.status, // PENDING, SUCCESSFUL, FAILED
            amount: parseFloat(response.data.amount),
            operator: response.data.operator,
            external_reference: response.data.external_reference,
            reason: response.data.reason // Si échec
        };

    } catch (error) {
        logger.error('❌ CamPay check status error:', error.response?.data || error.message);
        throw new Error('Erreur vérification statut paiement');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifier la signature du webhook CamPay
 */
function verifyWebhookSignature(payload, signature) {
    if (!campayConfig.webhookSecret) {
        logger.warn('⚠️ Webhook secret not configured, skipping verification');
        return true; // Laisser passer en dev si pas de secret
    }

    const computedSignature = crypto
        .createHmac('sha256', campayConfig.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

    return computedSignature === signature;
}

/**
 * Détecter l'opérateur depuis le numéro de téléphone
 * MTN : 237 67x, 237 68x, 237 650-654
 * Orange : 237 69x, 237 655-659
 */
function getOperatorFromPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    const prefix = digits.substring(3, 5); // Après le 237

    if (prefix === '67' || prefix === '68') return 'MTN';
    if (prefix === '69') return 'ORANGE';
    if (prefix === '65') {
        const subPrefix = parseInt(digits.substring(3, 6));
        return subPrefix <= 654 ? 'MTN' : 'ORANGE';
    }
    return 'UNKNOWN';
}

/**
 * Générer une référence externe unique pour AdsFacile
 */
function generateExternalReference() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `ADSFACILE_${timestamp}_${random}`;
}

module.exports = {
    getAccessToken,
    initiatePayment,
    checkPaymentStatus,
    verifyWebhookSignature,
    getOperatorFromPhone,
    generateExternalReference
};
