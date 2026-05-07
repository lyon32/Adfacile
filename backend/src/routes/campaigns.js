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
const { authenticate } = require('../middleware/auth');
const {
    createCampaign,
    listCampaigns,
    getCampaignDetails,
    updateStatus,
    deleteCampaign,
    uploadMedia
} = require('../controllers/campaignController');

// Configuration Multer: on garde le fichier en mémoire pour l'envoyer directement à Supabase
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max pour les vidéos
    }
});

// Toutes les routes nécessitent l'authentification
router.use(authenticate);

// CRUD
router.post('/', createCampaign);
router.get('/', listCampaigns);
router.get('/:id', getCampaignDetails);
router.patch('/:id/status', updateStatus);
router.delete('/:id', deleteCampaign);

// Upload
router.post('/upload-media', upload.single('file'), uploadMedia);

module.exports = router;
