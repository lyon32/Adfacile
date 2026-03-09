/**
 * Routes Billing — Plans, Paiements CamPay & Webhook
 * AdsFacile Backend
 *
 * GET    /plans              → Plans disponibles (public)
 * GET    /subscription       → Abonnement actuel (auth)
 * POST   /upgrade            → Initier un upgrade CamPay (auth)
 * GET    /payment/status     → Vérifier statut paiement (auth)
 * GET    /payments           → Historique des paiements (auth)
 * POST   /webhook            → Callback CamPay (signature)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    getPricingPlans,
    getCurrentSubscription,
    initiateUpgrade,
    checkPaymentStatusEndpoint,
    handleWebhook,
    getPaymentHistory,
    getPaymentMethodStatus
} = require('../controllers/billingController');

// Plans disponibles (public)
router.get('/plans', getPricingPlans);

// Routes authentifiées
router.get('/subscription', authenticate, getCurrentSubscription);
router.post('/upgrade', authenticate, initiateUpgrade);
router.get('/payment/status', authenticate, checkPaymentStatusEndpoint);
router.get('/payments', authenticate, getPaymentHistory);

// Backward compat: /invoices alias
router.get('/invoices', authenticate, getPaymentHistory);

// Facebook payment method status
router.get('/payment-method-status', authenticate, getPaymentMethodStatus);

// Webhook CamPay (pas d'auth user — vérifié par signature)
router.post('/webhook', handleWebhook);

module.exports = router;
