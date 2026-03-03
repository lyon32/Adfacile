/**
 * Configuration Axios - Service API
 * AdsFacile Frontend
 */

import axios from 'axios';

// URL de base de l'API
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Instance Axios configurée
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Intercepteur de requêtes - Ajouter le token JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur de réponses - Gestion des erreurs
// IMPORTANT: On ne fait JAMAIS de déconnexion ici.
// Les erreurs 401 sont remontées au composant appelant.
// Seul AuthContext.checkAuth() gère l'authentification.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log en dev pour debug
    if (error.response?.status === 401) {
      console.warn(
        `[API] 401 sur ${error.config?.url || 'unknown'} — `,
        error.response?.data?.message || 'Pas de message'
      );
    }
    return Promise.reject(error);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONS API AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inscription d'un nouvel utilisateur
 */
export const signup = async (userData) => {
  const response = await api.post('/auth/signup', userData);
  return response.data;
};

/**
 * Connexion d'un utilisateur
 * @param {Object} credentials - { identifier, password, remember_me }
 */
export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

/**
 * Demande de réinitialisation de mot de passe
 * @param {string} email
 */
export const forgotPassword = async (email) => {
  const response = await api.post('/auth/forgot-password', { email });
  return response.data;
};

/**
 * Réinitialisation du mot de passe
 * @param {Object} data - { token, newPassword, confirmPassword }
 */
export const resetPassword = async (data) => {
  const response = await api.post('/auth/reset-password', data);
  return response.data;
};

/**
 * Vérification de la santé de l'API
 */
export const checkHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONS API — INTELLIGENCE ARTIFICIELLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Génère 3 variations de texte publicitaire via IA
 * @param {Object} data - { product, niche, audience, tone, city }
 */
export const generateAdText = async (data) => {
  const response = await api.post('/ai/generate-text', data);
  return response.data;
};

/**
 * Génère 3 propositions de ciblage audience via IA
 * @param {Object} data - { niche, city, budget }
 */
export const generateTargeting = async (data) => {
  const response = await api.post('/ai/targeting', data);
  return response.data;
};

/**
 * Analyse avancée IA (PRO/Agency uniquement)
 * @param {Object} data - { text, analysisType }
 */
export const analyzeContent = async (data) => {
  const response = await api.post('/ai/analyze', data);
  return response.data;
};

/**
 * Récupère les crédits IA restants de l'utilisateur
 */
export const getAICredits = async () => {
  const response = await api.get('/ai/credits');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONS API — FACEBOOK BUSINESS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère l'URL d'authentification Facebook OAuth
 */
export const getFacebookAuthUrl = async () => {
  const response = await api.get('/facebook/auth/url');
  return response.data;
};

/**
 * Récupère le statut de connexion Facebook
 */
export const getFacebookStatus = async () => {
  const response = await api.get('/facebook/status');
  return response.data;
};

/**
 * Déconnecte le compte Facebook de l'utilisateur
 */
export const disconnectFacebook = async () => {
  const response = await api.post('/facebook/disconnect');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONS API CAMPAGNES
// ═══════════════════════════════════════════════════════════════════════════════

/** Liste des campagnes avec filtre optionnel */
export const getCampaigns = async (params = {}) => {
  const response = await api.get('/campaigns', { params });
  return response.data;
};

/** Créer une campagne */
export const createCampaignApi = async (data) => {
  const response = await api.post('/campaigns', data);
  return response.data;
};

/** Détails d'une campagne */
export const getCampaignById = async (id) => {
  const response = await api.get(`/campaigns/${id}`);
  return response.data;
};

/** Mettre à jour le statut d'une campagne */
export const updateCampaignStatus = async (id, status) => {
  const response = await api.patch(`/campaigns/${id}/status`, { status });
  return response.data;
};

/** Supprimer une campagne */
export const deleteCampaignApi = async (id) => {
  const response = await api.delete(`/campaigns/${id}`);
  return response.data;
};

export default api;
