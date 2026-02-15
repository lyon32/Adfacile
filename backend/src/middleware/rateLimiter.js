/**
 * Rate Limiting Middleware
 * AdsFacile Backend - Protection contre brute force
 */

const rateLimit = require('express-rate-limit');

/**
 * Login : max 5 tentatives / 15 minutes par IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Forgot password : max 3 tentatives / 1 heure par IP
 */
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3,
  message: {
    success: false,
    message: 'Trop de demandes de réinitialisation. Réessayez dans 1 heure.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Reset password : max 5 tentatives / 1 heure par IP
 */
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5,
  message: {
    success: false,
    message: 'Trop de tentatives de réinitialisation. Réessayez dans 1 heure.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter
};
