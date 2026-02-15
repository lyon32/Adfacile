/**
 * Routes d'authentification
 * AdsFacile Backend
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { signup, login, forgotPassword, resetPassword } = require('../controllers/authController');
const { signupValidationRules, handleValidationErrors } = require('../middleware/validateSignup');
const { loginLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimiter');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/signup - Inscription
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/signup', signupValidationRules, handleValidationErrors, signup);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/login - Connexion
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/login',
  loginLimiter,
  [
    body('identifier')
      .trim()
      .notEmpty().withMessage('L\'identifiant est requis (email ou téléphone)'),
    body('password')
      .notEmpty().withMessage('Le mot de passe est requis')
  ],
  handleValidationErrors,
  login
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/forgot-password - Mot de passe oublié
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/forgot-password',
  forgotPasswordLimiter,
  [
    body('email')
      .trim()
      .notEmpty().withMessage('L\'email est requis')
      .isEmail().withMessage('Format d\'email invalide')
      .normalizeEmail()
  ],
  handleValidationErrors,
  forgotPassword
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/reset-password - Réinitialiser le mot de passe
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/reset-password',
  resetPasswordLimiter,
  [
    body('token')
      .trim()
      .notEmpty().withMessage('Le token de réinitialisation est requis'),
    body('newPassword')
      .notEmpty().withMessage('Le nouveau mot de passe est requis')
      .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
      .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
      .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
      .matches(/\d/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
    body('confirmPassword')
      .notEmpty().withMessage('La confirmation du mot de passe est requise')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Les mots de passe ne correspondent pas');
        }
        return true;
      })
  ],
  handleValidationErrors,
  resetPassword
);

module.exports = router;
