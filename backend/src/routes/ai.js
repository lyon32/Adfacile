/**
 * Routes IA — Génération textes & ciblage publicitaire
 * AdsFacile Backend
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPlan } = require('../middleware/checkPlan');
const {
    generateText,
    generateTargeting,
    analyzeContent,
    getCredits
} = require('../controllers/aiController');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES IA
// Toutes les routes nécessitent une authentification JWT
// ═══════════════════════════════════════════════════════════════════════════════

// Génération de textes publicitaires (tous plans — crédits vérifiés dans le service)
router.post('/generate-text', authenticate, generateText);

// Propositions de ciblage audience (tous plans — crédits vérifiés dans le service)
router.post('/targeting', authenticate, generateTargeting);

// Analyse avancée IA (PRO/Agency uniquement — vérifié via checkPlan + service)
router.post('/analyze', authenticate, checkPlan('pro'), analyzeContent);

// Consultation des crédits IA restants (tous plans)
router.get('/credits', authenticate, getCredits);

module.exports = router;
