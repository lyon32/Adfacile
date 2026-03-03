/**
 * Facebook Service — Utilitaires OAuth & Graph API
 * AdsFacile Backend
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v19.0';

// ═══════════════════════════════════════════════════════════════════════════════
// CHIFFREMENT / DÉCHIFFREMENT DES TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-cbc';

/**
 * Dérive une clé de 32 bytes à partir du JWT_SECRET
 */
const getEncryptionKey = () => {
    const secret = process.env.JWT_SECRET || '';
    return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Chiffre un token Facebook avant stockage en base
 * @param {string} token - Access token en clair
 * @returns {string} Token chiffré (iv:encrypted en hex)
 */
const encryptToken = (token) => {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

/**
 * Déchiffre un token Facebook depuis la base
 * @param {string} encrypted - Token chiffré (iv:encrypted en hex)
 * @returns {string} Access token en clair
 */
const decryptToken = (encrypted) => {
    const key = getEncryptionKey();
    const [ivHex, encryptedData] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// ═══════════════════════════════════════════════════════════════════════════════
// OAUTH — ÉCHANGE DE TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Échange le code d'autorisation contre un access token court
 * @param {string} code - Code d'autorisation OAuth
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
 */
const exchangeCodeForToken = async (code) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/oauth/access_token`, {
            params: {
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
                code
            }
        });
        logger.info('✅ Code échangé contre access token');
        return response.data;
    } catch (error) {
        logger.error('❌ Erreur échange code→token:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || 'Erreur lors de l\'échange du code');
    }
};

/**
 * Échange un token court contre un long-lived token (60 jours)
 * @param {string} shortToken - Access token court
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
 */
const getLongLivedToken = async (shortToken) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                fb_exchange_token: shortToken
            }
        });
        logger.info('✅ Long-lived token obtenu (60 jours)');
        return response.data;
    } catch (error) {
        logger.error('❌ Erreur long-lived token:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || 'Erreur lors de l\'obtention du token long');
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH API — INFORMATIONS UTILISATEUR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère les infos de l'utilisateur Facebook
 * @param {string} accessToken
 * @returns {Promise<{id: string, name: string, email: string}>}
 */
const getUserInfo = async (accessToken) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/me`, {
            params: {
                fields: 'id,name,email',
                access_token: accessToken
            }
        });
        return response.data;
    } catch (error) {
        logger.error('❌ Erreur récupération infos utilisateur FB:', error.response?.data || error.message);
        throw new Error('Impossible de récupérer les informations Facebook');
    }
};

/**
 * Récupère les pages Facebook de l'utilisateur
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string, name: string, access_token: string}>>}
 */
const getUserPages = async (accessToken) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/me/accounts`, {
            params: {
                fields: 'id,name,access_token,category',
                access_token: accessToken
            }
        });
        return response.data.data || [];
    } catch (error) {
        logger.error('❌ Erreur récupération pages FB:', error.response?.data || error.message);
        throw new Error('Impossible de récupérer les pages Facebook');
    }
};

/**
 * Récupère les comptes publicitaires de l'utilisateur
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string, name: string, account_status: number}>>}
 */
const getAdAccounts = async (accessToken) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/me/adaccounts`, {
            params: {
                fields: 'id,name,account_status,currency,timezone_name',
                access_token: accessToken
            }
        });
        return response.data.data || [];
    } catch (error) {
        logger.error('❌ Erreur récupération comptes pub FB:', error.response?.data || error.message);
        throw new Error('Impossible de récupérer les comptes publicitaires');
    }
};

module.exports = {
    exchangeCodeForToken,
    getLongLivedToken,
    getUserInfo,
    getUserPages,
    getAdAccounts,
    encryptToken,
    decryptToken
};
