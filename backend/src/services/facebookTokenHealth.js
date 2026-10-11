/**
 * Santé du jeton Facebook
 * AdsFacile Backend
 *
 * Meta peut invalider un jeton à tout moment (code 190) : changement de mot de
 * passe, déconnexion « de tous les appareils », session réinitialisée pour
 * sécurité (sous-code 460), expiration (463). Aucune application ne peut
 * l'empêcher ; elle peut seulement le détecter et demander une reconnexion.
 *
 * Relevé réel du 7 oct. 2026 : jeton invalidé (190/460) alors qu'AdsFacile
 * affichait « connecté », parce que le statut ne lisait que la base. La
 * recherche de localisation et la liste des comptes publicitaires échouaient
 * en 500/502 génériques, sans dire pourquoi.
 *
 * Ce module :
 *  - vérifie le jeton auprès de Meta (debug_token), avec un cache court ;
 *  - reconnaît l'erreur 190 renvoyée par n'importe quel appel Graph ;
 *  - répond partout la même chose : 401 FACEBOOK_RECONNECT_REQUIRED.
 *
 * Pas de colonne en base : l'état vient toujours de Meta, le cache évite
 * seulement de l'interroger à chaque page.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { GRAPH_URL } = require('../config/facebook');

const CACHE_TTL_MS = 5 * 60 * 1000;
const RECONNECT_CODE = 'FACEBOOK_RECONNECT_REQUIRED';
const RECONNECT_MESSAGE = 'Facebook a interrompu la connexion de votre compte '
    + '(mot de passe modifié ou session réinitialisée par Facebook). '
    + 'Reconnectez Facebook pour continuer.';

const cache = new Map(); // userId → { etat, expire }

/** Vrai pour toute erreur Graph « jeton invalide » (code 190, tous sous-codes). */
const isTokenRevokedError = (err) => err?.response?.data?.error?.code === 190;

const memoriser = (userId, etat) => {
    cache.set(userId, { etat, expire: Date.now() + CACHE_TTL_MS });
    return etat;
};

/** Marque le jeton comme révoqué — appelé dès qu'un appel Graph renvoie 190. */
const markRevoked = (userId, subcode = null) => {
    if (!userId) return;
    memoriser(userId, { valid: false, reason: 'revoked', subcode });
};

/**
 * État du jeton selon Meta.
 * @returns {Promise<{valid: boolean|null, reason?: string, subcode?: number, dataAccessExpiresAt?: string}>}
 *   valid:null = Meta injoignable : on ne conclut pas à une révocation.
 */
const checkToken = async (userId, token) => {
    const enCache = cache.get(userId);
    if (enCache && enCache.expire > Date.now()) return enCache.etat;

    try {
        const { data } = await axios.get(`${GRAPH_URL}/debug_token`, {
            params: {
                input_token: token,
                access_token: `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`
            }
        });
        const d = data?.data || {};
        const fin = d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000).toISOString() : null;

        if (d.is_valid) {
            return memoriser(userId, { valid: true, dataAccessExpiresAt: fin });
        }
        return memoriser(userId, {
            valid: false,
            reason: 'revoked',
            subcode: d.error?.subcode ?? null,
            dataAccessExpiresAt: fin
        });
    } catch (err) {
        logger.warn(`⚠️ Vérification du jeton Facebook impossible : ${err.response?.data?.error?.message || err.message}`);
        return { valid: null }; // non mis en cache : on réessaiera
    }
};

/**
 * Si `err` est une révocation : répond 401 FACEBOOK_RECONNECT_REQUIRED et
 * renvoie true. Sinon ne fait rien et renvoie false.
 */
const respondIfRevoked = (res, err, userId) => {
    if (!isTokenRevokedError(err)) return false;
    const subcode = err.response.data.error.error_subcode ?? null;
    markRevoked(userId, subcode);
    logger.warn(`🔌 Jeton Facebook révoqué pour ${userId} (190/${subcode ?? '-'})`);
    res.status(401).json({ success: false, code: RECONNECT_CODE, message: RECONNECT_MESSAGE });
    return true;
};

/** Oublie l'état mis en cache (après une reconnexion OAuth). */
const forget = (userId) => cache.delete(userId);

module.exports = {
    isTokenRevokedError,
    checkToken,
    markRevoked,
    respondIfRevoked,
    forget,
    RECONNECT_CODE,
    RECONNECT_MESSAGE,
    _viderCache: () => cache.clear()
};
