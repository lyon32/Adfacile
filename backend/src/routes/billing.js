/**
 * Routes Billing — Plans & Paiements
 * AdsFacile Backend
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    getPricingPlans,
    getCurrentSubscription,
    initiateUpgrade,
    getInvoices
} = require('../controllers/billingController');

// Plans disponibles (public)
router.get('/plans', getPricingPlans);

// Abonnement actuel (authentifié)
router.get('/subscription', authenticate, getCurrentSubscription);

// Initier un upgrade (authentifié)
router.post('/upgrade', authenticate, initiateUpgrade);

// Historique factures (authentifié)
router.get('/invoices', authenticate, getInvoices);

module.exports = router;
