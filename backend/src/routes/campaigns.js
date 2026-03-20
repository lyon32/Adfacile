/**
 * Routes Campaigns — CRUD + Status Update
 * AdsFacile Backend
 * 
 * POST   /              → Créer campagne (3 niveaux Facebook)
 * GET    /              → Lister les campagnes
 * GET    /:id           → Détails d'une campagne
 * PATCH  /:id/status    → Pause/Resume
 * DELETE /:id           → Supprimer
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { authenticate } = require('../middleware/auth');
const {
    createCampaign,
    listCampaigns,
    getCampaignDetails,
    updateStatus,
    deleteCampaign,
    uploadMedia
} = require('../controllers/campaignController');

// Toutes les routes nécessitent l'authentification
router.use(authenticate);

// CRUD
router.post('/', createCampaign);
router.post('/upload-media', upload.single('file'), uploadMedia);
router.get('/', listCampaigns);
router.get('/:id', getCampaignDetails);
router.patch('/:id/status', updateStatus);
router.delete('/:id', deleteCampaign);

module.exports = router;
