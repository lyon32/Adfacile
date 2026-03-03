/**
 * Routes Facebook — Connexion OAuth & Gestion
 * AdsFacile Backend
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    getAuthUrl,
    handleCallback,
    getStatus,
    disconnect
} = require('../controllers/facebookController');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/facebook/auth/url — Générer URL OAuth (authentifié)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/auth/url', authenticate, getAuthUrl);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/facebook/callback — Retour OAuth Facebook (public, state contient userId)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/callback', handleCallback);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/facebook/status — Statut de connexion Facebook (authentifié)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/status', authenticate, getStatus);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/facebook/disconnect — Déconnecter Facebook (authentifié)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/disconnect', authenticate, disconnect);

module.exports = router;
