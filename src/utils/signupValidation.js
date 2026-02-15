/**
 * Utilitaires de validation frontend
 * AdsFacile Frontend
 */

/**
 * Valide le format d'un email
 * @param {string} email - L'email à valider
 * @returns {boolean} - true si l'email est valide
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valide le format d'un numéro de téléphone camerounais (9 chiffres)
 * @param {string} phone - Les 9 chiffres du numéro (sans +237)
 * @returns {boolean} - true si valide
 */
export const isValidPhone = (phone) => {
  // 9 chiffres commençant par 6, 2 ou 3
  const phoneRegex = /^[623]\d{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Normalise un numéro de téléphone au format +237XXXXXXXXX
 * @param {string} phone - Les 9 chiffres du numéro
 * @returns {string} - Le numéro complet avec +237
 */
export const normalizePhone = (phone) => {
  const cleaned = phone.replace(/\s/g, '');
  return `+237${cleaned}`;
};

/**
 * Calcule la force d'un mot de passe (0-100)
 * @param {string} password - Le mot de passe
 * @returns {Object} - { score, level, label, color }
 */
export const calculatePasswordStrength = (password) => {
  if (!password) {
    return { score: 0, level: 0, label: '', color: '#E5E7EB' };
  }

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

  score = Math.min(score, 100);

  // Déterminer le niveau et le label
  let level, label, color;
  
  if (score < 30) {
    level = 1;
    label = 'Faible';
    color = '#EF4444'; // Rouge
  } else if (score < 50) {
    level = 2;
    label = 'Moyen';
    color = '#F97316'; // Orange
  } else if (score < 75) {
    level = 3;
    label = 'Bon';
    color = '#EAB308'; // Jaune
  } else {
    level = 4;
    label = 'Excellent';
    color = '#10B981'; // Vert
  }

  return { score, level, label, color };
};

/**
 * Valide un mot de passe selon les critères requis
 * @param {string} password - Le mot de passe
 * @returns {Object} - { isValid, errors }
 */
export const validatePassword = (password) => {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Au moins 8 caractères');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Au moins une majuscule');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Au moins une minuscule');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Au moins un chiffre');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Vérifie si les deux mots de passe correspondent
 * @param {string} password - Mot de passe
 * @param {string} confirmPassword - Confirmation
 * @returns {boolean}
 */
export const passwordsMatch = (password, confirmPassword) => {
  return password === confirmPassword && password.length > 0;
};

/**
 * Liste des niches disponibles
 */
export const NICHES = [
  { value: '', label: 'Sélectionnez votre secteur (optionnel)' },
  { value: 'Restaurant', label: 'Restaurant / Alimentation' },
  { value: 'Mode', label: 'Mode / Vêtements' },
  { value: 'Formation', label: 'Formation / Coaching' },
  { value: 'Beauté', label: 'Beauté / Cosmétiques' },
  { value: 'Tech', label: 'Tech / Digital' },
  { value: 'Immobilier', label: 'Immobilier' },
  { value: 'Santé', label: 'Santé / Bien-être' },
  { value: 'Événementiel', label: 'Événementiel' },
  { value: 'E-commerce', label: 'E-commerce' },
  { value: 'Services B2B', label: 'Services B2B' },
  { value: 'Autre', label: 'Autre' }
];

/**
 * Liste des villes camerounaises
 */
export const CITIES = [
  { value: 'Douala', label: 'Douala' },
  { value: 'Yaoundé', label: 'Yaoundé' },
  { value: 'Bafoussam', label: 'Bafoussam' },
  { value: 'Garoua', label: 'Garoua' },
  { value: 'Bamenda', label: 'Bamenda' },
  { value: 'Maroua', label: 'Maroua' },
  { value: 'Ngaoundéré', label: 'Ngaoundéré' },
  { value: 'Bertoua', label: 'Bertoua' },
  { value: 'Kribi', label: 'Kribi' },
  { value: 'Limbé', label: 'Limbé' }
];
