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
 * @returns {Promise<{id: string, name: string}>}
 */
const getUserInfo = async (accessToken) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/me`, {
            params: {
                fields: 'id,name',
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
                fields: 'id,name,access_token,category,tasks',
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
/**
 * Récupère le compte Instagram lié à la page Facebook
 * @param {string} fbPageId 
 * @param {string} accessToken 
 * @returns {Promise<Object|null>}
 */
const getConnectedInstagramAccount = async (fbPageId, accessToken) => {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🔍 getConnectedInstagramAccount called`);
    logger.info(`  Page ID: ${fbPageId}`);
    logger.info(`  Token (first 20 chars): ${accessToken.substring(0, 20)}...`);
    logger.info(`  Token length: ${accessToken.length}`);

    try {
        const url = `${FACEBOOK_GRAPH_URL}/${fbPageId}`;
        const fields = 'instagram_business_account{id,username,profile_picture_url,name,followers_count}';

        logger.info(`  Request URL: ${url}`);
        logger.info(`  Fields: ${fields}`);

        const response = await axios.get(url, {
            params: {
                fields,
                access_token: accessToken
            }
        });

        logger.info(`  ✅ API Response status: ${response.status}`);
        logger.info(`  Response keys: ${Object.keys(response.data).join(', ')}`);
        logger.info(`  Full response: ${JSON.stringify(response.data)}`);

        if (response.data.instagram_business_account) {
            const ig = response.data.instagram_business_account;
            logger.info(`  ✅ INSTAGRAM FOUND!`);
            logger.info(`    Username: @${ig.username}`);
            logger.info(`    ID: ${ig.id}`);
            logger.info(`    Name: ${ig.name}`);
            logger.info(`    Followers: ${ig.followers_count}`);
            return ig;
        } else {
            logger.info(`  ❌ No instagram_business_account in response`);
            logger.info(`  Hint: Instagram may not be linked to this Page`);
            logger.info(`  Hint: Go to Page Settings → Instagram and connect your account`);
            return null;
        }
    } catch (error) {
        logger.error(`  ❌ INSTAGRAM API ERROR`);
        logger.error(`    HTTP Status: ${error.response?.status}`);
        logger.error(`    Error code: ${error.response?.data?.error?.code}`);
        logger.error(`    Error type: ${error.response?.data?.error?.type}`);
        logger.error(`    Error message: ${error.response?.data?.error?.message}`);
        logger.error(`    Full error: ${JSON.stringify(error.response?.data)}`);

        if (error.response?.data?.error?.code === 190) {
            logger.error(`  ⚠️ TOKEN ERROR — Token expired or invalid. User needs to reconnect.`);
        }
        if (error.response?.data?.error?.code === 100) {
            logger.error(`  ⚠️ PERMISSION ERROR — Missing instagram_basic permission.`);
        }
        if (error.response?.data?.error?.code === 10) {
            logger.error(`  ⚠️ PERMISSION ERROR — App does not have permission for this action.`);
        }

        return null;
    }
};

/**
 * Récupère les comptes WhatsApp Business depuis le Business Manager
 * WhatsApp est lié au Business Manager, pas directement à la Page
 * @param {string} accessToken 
 * @returns {Promise<Object|null>}
 */
const getWhatsAppAccounts = async (accessToken) => {
    try {
        logger.info('🔍 Checking WhatsApp accounts in Business Manager...');

        // Step 1: Get user's businesses
        const businessesRes = await axios.get(
            `${FACEBOOK_GRAPH_URL}/me/businesses`,
            {
                params: {
                    fields: 'id,name',
                    access_token: accessToken
                }
            }
        );

        const businesses = businessesRes.data.data;
        if (!businesses || businesses.length === 0) {
            logger.info('❌ No businesses found');
            return null;
        }

        // Loop through all businesses to find a WhatsApp account
        for (const business of businesses) {
            logger.info(`📊 Checking Business ID: ${business.id} (${business.name})`);

            const endpointsToTry = [
                'owned_whatsapp_business_accounts',
                'client_whatsapp_business_accounts',
                'whatsapp_business_accounts'
            ];

            for (const endpoint of endpointsToTry) {
                try {
                    const whatsappRes = await axios.get(
                        `${FACEBOOK_GRAPH_URL}/${business.id}/${endpoint}`,
                        {
                            params: {
                                fields: 'id,name,phone_number,verified_name,account_review_status',
                                access_token: accessToken
                            }
                        }
                    );

                    if (whatsappRes.data.data && whatsappRes.data.data.length > 0) {
                        const wa = whatsappRes.data.data[0];
                        logger.info(`✅ WhatsApp found via ${endpoint}: ${wa.name || wa.verified_name || wa.id}`);
                        return {
                            id: wa.id,
                            name: wa.name,
                            phone_number: wa.phone_number,
                            verified_name: wa.verified_name,
                            account_review_status: wa.account_review_status
                        };
                    }
                } catch (endpointError) {
                    logger.debug(`⚠️ Failed to fetch from endpoint ${endpoint} for business ${business.id}: ${endpointError.message}`);
                    if (endpointError.response?.data?.error?.code === 190) {
                        logger.error('⚠️ Token error - may need to reconnect Facebook');
                        return null; // Stop searching if token is invalid
                    }
                }
            }
        }

        // Fallback: If no WhatsApp account was found but we have businesses, return the first business ID
        // so the frontend can generate the Facebook Business Manager link.
        logger.info('❌ No WhatsApp accounts found in any business');
        return businesses.length > 0 ? { _fallback_business_id: businesses[0].id } : null;

    } catch (error) {
        logger.error('❌ Get WhatsApp accounts error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        if (error.response?.data?.error?.code === 190) {
            logger.error('⚠️ Token error - may need to reconnect Facebook');
        }
        if (error.response?.data?.error?.code === 100) {
            logger.error('⚠️ Missing whatsapp_business_management permission');
        }

        return null;
    }
};

/**
 * Récupère le compte WhatsApp Business lié à la page Facebook
 * Fallback: si pas trouvé via Page, cherche via Business Manager
 * @param {string} fbPageId 
 * @param {string} accessToken 
 * @returns {Promise<Object|null>}
 */
const getConnectedWhatsAppAccount = async (fbPageId, accessToken) => {
    try {
        logger.info(`🔍 Checking WhatsApp for Page ID: ${fbPageId}`);

        const response = await axios.get(
            `${FACEBOOK_GRAPH_URL}/${fbPageId}`,
            {
                params: {
                    fields: 'whatsapp_business_account{id,phone_number,verified_name}',
                    access_token: accessToken
                }
            }
        );

        if (response.data.whatsapp_business_account) {
            logger.info('✅ WhatsApp found via Page');
            return response.data.whatsapp_business_account;
        } else {
            logger.info('❌ No WhatsApp on Page, trying Business Manager...');
            return await getWhatsAppAccounts(accessToken);
        }

    } catch (error) {
        logger.error('❌ WhatsApp Page check failed, trying Business Manager...');
        return await getWhatsAppAccounts(accessToken);
    }
};

/**
 * Récupère les permissions Facebook accordées par l'utilisateur
 * @param {string} accessToken 
 * @returns {Promise<Array<{permission: string, status: string}>>}
 */
const getUserPermissions = async (accessToken) => {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/me/permissions`, {
            params: { access_token: accessToken }
        });
        return response.data.data || [];
    } catch (error) {
        logger.error('❌ Erreur récupération permissions:', error.response?.data || error.message);
        throw new Error('Impossible de récupérer les permissions Facebook');
    }
};

module.exports = {
    exchangeCodeForToken,
    getLongLivedToken,
    getUserInfo,
    getUserPages,
    getAdAccounts,
    encryptToken,
    decryptToken,
    getConnectedInstagramAccount,
    getConnectedWhatsAppAccount,
    getWhatsAppAccounts,
    getUserPermissions
};
