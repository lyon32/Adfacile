/**
 * Routes Analytics — Insights Facebook + Export
 * AdsFacile Backend
 *
 * GET  /              → Récupérer les analytics (tous plans)
 * POST /export        → Exporter les données (PRO uniquement)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPlan } = require('../middleware/checkPlan');
const { getAnalytics, exportAnalytics } = require('../controllers/analyticsController');

// Toutes les routes nécessitent l'authentification
router.use(authenticate);

// Analytics data (tous plans)
router.get('/', getAnalytics);

// Export (PRO+ uniquement)
router.post('/export', checkPlan('pro'), exportAnalytics);

module.exports = router;
