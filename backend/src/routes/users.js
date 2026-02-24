/**
 * Routes Profil Utilisateur
 * AdsFacile Backend
 * 
 * Toutes les routes nécessitent une authentification JWT
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    getProfile,
    updateProfile,
    updateEmail,
    updatePhone,
    uploadProfilePicture,
    deleteAccount,
    getPlanLimits
} = require('../controllers/userController');
const {
    validateUpdateProfile,
    validateUpdateEmail,
    validateUpdatePhone,
    validateDeleteAccount
} = require('../validators/userValidators');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES PROFIL UTILISATEUR
// Toutes les routes sont protégées par le middleware authenticate
// ═══════════════════════════════════════════════════════════════════════════════

// Récupérer le profil
router.get('/me', authenticate, getProfile);

// Mettre à jour le profil (infos personnelles)
router.put('/me', authenticate, validateUpdateProfile, updateProfile);

// Changer l'email (nécessite mot de passe + confirmation)
router.put('/me/email', authenticate, validateUpdateEmail, updateEmail);

// Changer le téléphone
router.put('/me/phone', authenticate, validateUpdatePhone, updatePhone);

// Upload photo de profil (avatar)
router.post('/me/avatar', authenticate, uploadProfilePicture);

// Supprimer le compte (nécessite mot de passe + "SUPPRIMER")
router.delete('/me', authenticate, validateDeleteAccount, deleteAccount);

// Récupérer les limites du plan actuel
router.get('/me/plan-limits', authenticate, getPlanLimits);

module.exports = router;
