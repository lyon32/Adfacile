/**
 * Facebook Controller — Connexion OAuth Facebook Business
 * AdsFacile Backend
 */

const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const {
    exchangeCodeForToken,
    getLongLivedToken,
    getUserInfo,
    getUserPages,
    getAdAccounts,
    encryptToken
} = require('../services/facebookService');

// ═══════════════════════════════════════════════════════════════════════════════
// SCOPES FACEBOOK — Couvre les 3 use cases :
//   1. Create & manage ads with Marketing API
//   2. Measure ad performance data with Marketing API
//   3. Create & manage app ads with Meta Ads Manager
// ═══════════════════════════════════════════════════════════════════════════════
const FACEBOOK_SCOPES = [
    'email',
    'pages_show_list',
    'ads_management',
    'ads_read',
    'business_management'
].join(',');

/**
 * GET /api/facebook/auth/url
 * Génère l'URL OAuth Facebook avec protection CSRF
 */
const getAuthUrl = async (req, res) => {
    try {
        const state = crypto.randomBytes(16).toString('hex');

        // Stocker le state en session côté serveur via un token temporaire
        // On encode le user_id + state dans le state param pour le récupérer au callback
        const statePayload = Buffer.from(JSON.stringify({
            csrf: state,
            userId: req.user.id
        })).toString('base64url');

        const params = new URLSearchParams({
            client_id: process.env.FACEBOOK_APP_ID,
            redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
            scope: FACEBOOK_SCOPES,
            response_type: 'code',
            state: statePayload
        });

        const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;

        logger.info(`🔗 URL OAuth Facebook générée pour user ${req.user.id}`);

        res.json({
            success: true,
            data: { authUrl }
        });
    } catch (error) {
        logger.error('❌ Erreur génération URL OAuth:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération de l\'URL d\'authentification Facebook'
        });
    }
};

/**
 * GET /api/facebook/callback
 * Gère le retour OAuth Facebook :
 *   1. Échange code → short-lived token
 *   2. Échange short → long-lived token (60 jours)
 *   3. Récupère infos utilisateur, pages, comptes pub
 *   4. Sauvegarde en base (upsert)
 *   5. Redirige vers le dashboard frontend
 */
const handleCallback = async (req, res) => {
    try {
        const { code, state, error: fbError, error_description } = req.query;

        // Erreur renvoyée par Facebook (ex: utilisateur a refusé)
        if (fbError) {
            logger.warn(`⚠️ Facebook OAuth refusé: ${fbError} — ${error_description}`);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/dashboard?fb_error=${encodeURIComponent(error_description || fbError)}`);
        }

        if (!code || !state) {
            logger.warn('⚠️ Callback Facebook sans code ou state');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/dashboard?fb_error=missing_params`);
        }

        // Décoder le state pour récupérer le userId
        let statePayload;
        try {
            statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
        } catch {
            logger.warn('⚠️ State OAuth invalide');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/dashboard?fb_error=invalid_state`);
        }

        const userId = statePayload.userId;
        if (!userId) {
            logger.warn('⚠️ userId absent du state OAuth');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/dashboard?fb_error=invalid_state`);
        }

        // 1. Échanger le code contre un short-lived token
        const tokenData = await exchangeCodeForToken(code);
        const shortToken = tokenData.access_token;

        // 2. Obtenir un long-lived token (60 jours)
        const longTokenData = await getLongLivedToken(shortToken);
        const longToken = longTokenData.access_token;

        // 3. Récupérer les infos utilisateur Facebook
        const fbUser = await getUserInfo(longToken);
        logger.info(`📘 Utilisateur FB: ${fbUser.name} (${fbUser.id})`);

        // 4. Récupérer les pages Facebook
        const pages = await getUserPages(longToken);
        logger.info(`📄 ${pages.length} page(s) Facebook trouvée(s)`);

        // 5. Récupérer les comptes publicitaires
        const adAccounts = await getAdAccounts(longToken);
        logger.info(`📊 ${adAccounts.length} compte(s) publicitaire(s) trouvé(s)`);

        // Prendre le premier compte pub actif (account_status = 1)
        const activeAdAccount = adAccounts.find(a => a.account_status === 1) || adAccounts[0];
        const firstPage = pages[0] || null;

        if (!activeAdAccount) {
            logger.warn(`⚠️ Aucun compte publicitaire trouvé pour user ${userId}`);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/dashboard?fb_error=no_ad_account`);
        }

        // 6. Chiffrer le token avant stockage
        const encryptedToken = encryptToken(longToken);

        // 7. Upsert dans facebook_accounts (un seul compte FB par utilisateur)
        const { data: existing } = await supabase
            .from('facebook_accounts')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (existing) {
            // Mise à jour
            const { error: updateError } = await supabase
                .from('facebook_accounts')
                .update({
                    fb_user_id: fbUser.id,
                    fb_account_id: activeAdAccount.id,
                    fb_page_id: firstPage?.id || null,
                    fb_page_name: firstPage?.name || null,
                    fb_access_token: encryptedToken,
                    is_active: true,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (updateError) {
                logger.error('❌ Erreur mise à jour facebook_accounts:', updateError);
                throw updateError;
            }
            logger.info(`✅ Compte Facebook mis à jour pour user ${userId}`);
        } else {
            // Insertion
            const { error: insertError } = await supabase
                .from('facebook_accounts')
                .insert({
                    user_id: userId,
                    fb_user_id: fbUser.id,
                    fb_account_id: activeAdAccount.id,
                    fb_page_id: firstPage?.id || null,
                    fb_page_name: firstPage?.name || null,
                    fb_access_token: encryptedToken,
                    is_active: true
                });

            if (insertError) {
                logger.error('❌ Erreur insertion facebook_accounts:', insertError);
                throw insertError;
            }
            logger.info(`✅ Compte Facebook connecté pour user ${userId}`);
        }

        // 8. Rediriger vers le dashboard frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/dashboard?connected=true`);

    } catch (error) {
        logger.error('❌ Erreur callback Facebook:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/dashboard?fb_error=${encodeURIComponent(error.message || 'unknown_error')}`);
    }
};

/**
 * GET /api/facebook/status
 * Retourne le statut de connexion Facebook de l'utilisateur
 */
const getStatus = async (req, res) => {
    try {
        const { data: account, error } = await supabase
            .from('facebook_accounts')
            .select('fb_account_id, fb_page_id, fb_page_name, fb_user_id, is_active, created_at, updated_at')
            .eq('user_id', req.user.id)
            .eq('is_active', true)
            .single();

        if (error || !account) {
            return res.json({
                success: true,
                data: {
                    connected: false,
                    pageName: null,
                    accountId: null
                }
            });
        }

        res.json({
            success: true,
            data: {
                connected: true,
                pageName: account.fb_page_name,
                accountId: account.fb_account_id,
                pageId: account.fb_page_id,
                fbUserId: account.fb_user_id,
                connectedAt: account.created_at,
                updatedAt: account.updated_at
            }
        });
    } catch (error) {
        logger.error('❌ Erreur récupération statut Facebook:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du statut Facebook'
        });
    }
};

/**
 * POST /api/facebook/disconnect
 * Déconnecte le compte Facebook de l'utilisateur
 */
const disconnect = async (req, res) => {
    try {
        const { error } = await supabase
            .from('facebook_accounts')
            .delete()
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('❌ Erreur suppression facebook_accounts:', error);
            throw error;
        }

        logger.info(`🔌 Compte Facebook déconnecté pour user ${req.user.id}`);

        res.json({
            success: true,
            message: 'Compte Facebook déconnecté avec succès'
        });
    } catch (error) {
        logger.error('❌ Erreur déconnexion Facebook:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la déconnexion du compte Facebook'
        });
    }
};

module.exports = {
    getAuthUrl,
    handleCallback,
    getStatus,
    disconnect
};
