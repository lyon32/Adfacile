/**
 * Routes Billing — Plans, Paiements SasPay
 * AdsFacile Backend
 *
 * GET    /plans              → Plans disponibles (public)
 * GET    /subscription       → Abonnement actuel (auth)
 * GET    /payment-networks   → Pays et réseaux SasPay, frais compris (auth)
 * POST   /upgrade            → Initier un paiement SasPay (auth)
 * POST   /payment/confirm-otp→ Code reçu par SMS après la demande (auth)
 * GET    /payment/status     → Vérifier statut paiement (auth)
 * GET    /payments           → Historique des paiements (auth)
 * POST   /webhook            → monté dans server.js (corps brut, signature)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    getPricingPlans,
    getCurrentSubscription,
    initiateUpgrade,
    checkPaymentStatusEndpoint,
    getPaymentNetworks,
    confirmPaymentOtp,
    getPaymentHistory,
    getPaymentMethodStatus
} = require('../controllers/billingController');

// Plans disponibles (public)
router.get('/plans', getPricingPlans);

// Routes authentifiées
router.get('/subscription', authenticate, getCurrentSubscription);
router.get('/payment-networks', authenticate, getPaymentNetworks);
router.post('/upgrade', authenticate, initiateUpgrade);
router.post('/payment/confirm-otp', authenticate, confirmPaymentOtp);
router.get('/payment/status', authenticate, checkPaymentStatusEndpoint);
router.get('/payments', authenticate, getPaymentHistory);

// Backward compat: /invoices alias
router.get('/invoices', authenticate, getPaymentHistory);

// Facebook payment method status
router.get('/payment-method-status', authenticate, getPaymentMethodStatus);

module.exports = router;
