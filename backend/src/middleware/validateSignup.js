/**
 * Middleware de validation pour le signup
 * AdsFacile Backend
 */

const { body, validationResult } = require('express-validator');
const { VALID_NICHES, VALID_CITIES } = require('../utils/validation');

/**
 * Règles de validation pour le signup
 */
const signupValidationRules = [
  // Email - requis, format valide, lowercase
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Format d\'email invalide')
    .normalizeEmail()
    .toLowerCase(),

  // Mot de passe - requis, min 8 chars, 1 maj, 1 min, 1 chiffre
  body('password')
    .notEmpty().withMessage('Le mot de passe est requis')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/\d/).withMessage('Le mot de passe doit contenir au moins un chiffre'),

  // Confirmation mot de passe - doit correspondre
  body('confirmPassword')
    .notEmpty().withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),

  // Téléphone - requis, format camerounais
  body('phone')
    .trim()
    .notEmpty().withMessage('Le numéro de téléphone est requis')
    .matches(/^\+237[623]\d{8}$/).withMessage('Format de téléphone invalide. Utilisez +237 suivi de 9 chiffres'),

  // Prénom - optionnel
  body('first_name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Le prénom ne doit pas dépasser 100 caractères')
    .escape(),

  // Nom - optionnel
  body('last_name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Le nom ne doit pas dépasser 100 caractères')
    .escape(),

  // Nom de l'entreprise - optionnel
  body('business_name')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Le nom de l\'entreprise ne doit pas dépasser 255 caractères')
    .escape(),

  // Niche - optionnel, doit être dans la liste
  body('niche')
    .optional()
    .trim()
    .isIn(VALID_NICHES).withMessage('Niche invalide'),

  // Ville - défaut Douala, doit être dans la liste
  body('city')
    .optional()
    .trim()
    .isIn(VALID_CITIES).withMessage('Ville invalide'),

  // Accept terms - requis, doit être true
  body('accept_terms')
    .notEmpty().withMessage('Vous devez accepter les conditions d\'utilisation')
    .isBoolean().withMessage('accept_terms doit être un booléen')
    .custom((value) => {
      if (value !== true && value !== 'true') {
        throw new Error('Vous devez accepter les conditions d\'utilisation');
      }
      return true;
    }),

  // Newsletter - optionnel
  body('newsletter')
    .optional()
    .isBoolean().withMessage('newsletter doit être un booléen')
];

/**
 * Middleware pour traiter les erreurs de validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg
    }));

    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: formattedErrors
    });
  }
  
  next();
};

module.exports = {
  signupValidationRules,
  handleValidationErrors
};
