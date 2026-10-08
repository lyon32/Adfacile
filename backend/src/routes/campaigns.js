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
const { ALLOWED_MIME } = require('../utils/mediaSpecs');
const { authenticate } = require('../middleware/auth');
const {
    createCampaign,
    listCampaigns,
    getCampaignDetails,
    updateStatus,
    deleteCampaign,
    getCreationJob,
    uploadMedia
} = require('../controllers/campaignController');

// Configuration Multer: on garde le fichier en mémoire pour l'envoyer directement à Supabase
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max pour les vidéos
    },
    // Seuls les formats acceptés par Meta et que nous savons traiter.
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
        const err = new Error('Format non accepté : JPG, PNG, MP4 ou MOV uniquement.');
        err.status = 400;
        return cb(err);
    }
});

// Les erreurs de multer (format, taille) doivent arriver en JSON lisible.
function uploadSingle(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Fichier trop lourd : 50 Mo maximum.'
            : err.message;
        return res.status(400).json({ success: false, message });
    });
}

// Toutes les routes nécessitent l'authentification
router.use(authenticate);

// CRUD
router.post('/', createCampaign);
router.get('/', listCampaigns);
router.get('/jobs/:id', getCreationJob);
router.get('/:id', getCampaignDetails);
router.patch('/:id/status', updateStatus);
router.delete('/:id', deleteCampaign);

// Upload
router.post('/upload-media', uploadSingle, uploadMedia);

module.exports = router;
