/**
 * Utilitaires de validation
 * AdsFacile Backend
 */

/**
 * Valide le format d'un email
 * @param {string} email - L'email à valider
 * @returns {boolean} - true si l'email est valide
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valide le format d'un numéro de téléphone camerounais
 * Format attendu: +237XXXXXXXXX (9 chiffres après +237)
 * @param {string} phone - Le numéro à valider
 * @returns {boolean} - true si le numéro est valide
 */
const isValidCameroonPhone = (phone) => {
  // Accepte +237 suivi de 9 chiffres (commençant par 6, 2 ou 3)
  const phoneRegex = /^\+237[623]\d{8}$/;
  return phoneRegex.test(phone);
};

/**
 * Normalise un numéro de téléphone au format +237XXXXXXXXX
 * @param {string} phone - Le numéro à normaliser
 * @returns {string} - Le numéro normalisé
 */
const normalizePhone = (phone) => {
  // Supprimer tous les espaces et caractères non numériques (sauf +)
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Si le numéro ne commence pas par +237, l'ajouter
  if (!normalized.startsWith('+237')) {
    if (normalized.startsWith('237')) {
      normalized = '+' + normalized;
    } else if (normalized.startsWith('6') || normalized.startsWith('2') || normalized.startsWith('3')) {
      normalized = '+237' + normalized;
    }
  }
  
  return normalized;
};

/**
 * Valide la force d'un mot de passe
 * Requis: min 8 chars, 1 majuscule, 1 minuscule, 1 chiffre
 * @param {string} password - Le mot de passe à valider
 * @returns {object} - { isValid: boolean, errors: string[] }
 */
const validatePasswordStrength = (password) => {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Le mot de passe doit contenir au moins 8 caractères');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une minuscule');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Calcule un score de force pour un mot de passe (0-100)
 * @param {string} password - Le mot de passe
 * @returns {number} - Score de 0 à 100
 */
const getPasswordStrengthScore = (password) => {
  let score = 0;
  
  // Longueur (max 30 points)
  score += Math.min(password.length * 3, 30);
  
  // Majuscules (15 points)
  if (/[A-Z]/.test(password)) score += 15;
  
  // Minuscules (15 points)
  if (/[a-z]/.test(password)) score += 15;
  
  // Chiffres (20 points)
  if (/\d/.test(password)) score += 20;
  
  // Caractères spéciaux (20 points)
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 20;
  
  return Math.min(score, 100);
};

/**
 * Liste des niches disponibles
 */
const VALID_NICHES = [
  'Restaurant',
  'Mode',
  'Formation',
  'Beauté',
  'Tech',
  'Immobilier',
  'Santé',
  'Événementiel',
  'E-commerce',
  'Services B2B',
  'Autre'
];

/**
 * Liste des villes camerounaises disponibles
 */
const VALID_CITIES = [
  'Douala',
  'Yaoundé',
  'Bafoussam',
  'Garoua',
  'Bamenda',
  'Maroua',
  'Ngaoundéré',
  'Bertoua',
  'Kribi',
  'Limbé'
];

module.exports = {
  isValidEmail,
  isValidCameroonPhone,
  normalizePhone,
  validatePasswordStrength,
  getPasswordStrengthScore,
  VALID_NICHES,
  VALID_CITIES
};
