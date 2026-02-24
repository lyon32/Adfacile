/**
 * Validateurs Profil Utilisateur
 * AdsFacile Backend
 * 
 * Utilise express-validator pour la validation des entrées
 */

const { body, validationResult } = require('express-validator');

// ═══════════════════════════════════════════════════════════════════════════════
// LISTE DES NICHES AUTORISÉES
// ═══════════════════════════════════════════════════════════════════════════════

const NICHE_WHITELIST = [
    'Restaurant',
    'Mode',
    'Tech',
    'Formation',
    'Santé',
    'Beauté',
    'Agriculture',
    'Immobilier',
    'Transport',
    'Autre'
];

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE : Vérifier les erreurs de validation
// ═══════════════════════════════════════════════════════════════════════════════

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Erreurs de validation',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATEURS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validation pour PUT /api/users/me (mise à jour profil)
 */
const validateUpdateProfile = [
    body('first_name')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Le prénom ne peut pas dépasser 100 caractères'),

    body('last_name')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Le nom ne peut pas dépasser 100 caractères'),

    body('business_name')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Le nom d\'entreprise ne peut pas dépasser 255 caractères'),

    body('niche')
        .optional()
        .isIn(NICHE_WHITELIST)
        .withMessage(`Secteur invalide. Valeurs autorisées : ${NICHE_WHITELIST.join(', ')}`),

    body('city')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('La ville ne peut pas dépasser 100 caractères'),

    body('bio')
        .optional()
        .isLength({ max: 500 })
        .withMessage('La bio ne peut pas dépasser 500 caractères'),

    handleValidationErrors
];

/**
 * Validation pour PUT /api/users/me/email (changement email)
 */
const validateUpdateEmail = [
    body('new_email')
        .notEmpty()
        .withMessage('Le nouvel email est requis')
        .isEmail()
        .withMessage('Format d\'email invalide')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Le mot de passe actuel est requis'),

    handleValidationErrors
];

/**
 * Validation pour PUT /api/users/me/phone (changement téléphone)
 */
const validateUpdatePhone = [
    body('phone')
        .notEmpty()
        .withMessage('Le numéro de téléphone est requis')
        .matches(/^\+?237[0-9]{8,9}$/)
        .withMessage('Format invalide. Utilisez le format +237XXXXXXXXX'),

    handleValidationErrors
];

/**
 * Validation pour DELETE /api/users/me (suppression compte)
 */
const validateDeleteAccount = [
    body('password')
        .notEmpty()
        .withMessage('Le mot de passe est requis pour confirmer la suppression'),

    body('confirmation')
        .equals('SUPPRIMER')
        .withMessage('Tapez "SUPPRIMER" pour confirmer'),

    handleValidationErrors
];

module.exports = {
    validateUpdateProfile,
    validateUpdateEmail,
    validateUpdatePhone,
    validateDeleteAccount,
    handleValidationErrors,
    NICHE_WHITELIST
};
