/**
 * Facebook Controller — Connexion OAuth Facebook Business
 * AdsFacile Backend
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { OAUTH_DIALOG_URL, validateFacebookConfig } = require('../config/facebook');
const { createOAuthState, verifyOAuthState } = require('../utils/oauthState');
const {
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
    getUserPermissions,
    getAdAccountPixels,
    describeAdAccountStatus
} = require('../services/facebookService');
const tokenHealth = require('../services/facebookTokenHealth');

// ═══════════════════════════════════════════════════════════════════════════════
// SCOPES FACEBOOK — Marketing API + Instagram + WhatsApp
// ═══════════════════════════════════════════════════════════════════════════════

const FACEBOOK_SCOPES = [
    'pages_show_list',
    'ads_management',
    'business_management',
    'pages_read_engagement',
    // Instagram permissions
    'instagram_basic',
    'instagram_manage_insights',
    // WhatsApp permissions
    'whatsapp_business_management',
    // Publicités à formulaire : sans elles, /leadgen_forms répond « Requires
    // pages_manage_ads permission » et l'objectif Prospects ne peut pas lister
    // les formulaires. En mode Développement, Meta les accorde sans revue aux
    // personnes ayant un rôle sur l'application.
    'pages_manage_ads',
    'leads_retrieval'
].join(',');

/**
 * Récupère le compte Facebook actif d'un utilisateur.
 *
 * Remplace le .single() utilisé auparavant : celui-ci échoue dès qu'il existe
 * plus d'une ligne active, et l'erreur était interprétée comme « aucun compte
 * connecté ». Un utilisateur avec deux lignes actives voyait donc son compte
 * signalé comme déconnecté alors que la connexion était valide.
 * On prend ici la ligne la plus récente et on laisse passer le cas « aucune ».
 *
 * @param {string} userId
 * @param {string} columns - colonnes à sélectionner
 * @returns {Promise<{ account: object|null, error: object|null }>}
 */
const getActiveAccount = async (userId, columns) => {
    const { data, error } = await supabase
        .from('facebook_accounts')
        .select(columns)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return { account: data || null, error: error || null };
};

/**
 * Garantit qu'une seule ligne reste active pour l'utilisateur.
 *
 * Le callback supprimait les anciennes lignes avant de réinsérer, mais sans
 * vérifier que la suppression avait bien eu lieu. Deux lignes actives
 * pouvaient coexister et mettre en défaut toutes les lectures suivantes.
 *
 * @param {string} userId
 * @param {string} pageIdActive - la page qui doit rester active
 */
const enforceSingleActivePage = async (userId, pageIdActive) => {
    const { data, error } = await supabase
        .from('facebook_accounts')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true)
        .neq('fb_page_id', pageIdActive)
        .select('fb_page_id, fb_page_name');

    if (error) {
        logger.error('❌ Impossible de désactiver les anciennes pages:', error.message);
        return;
    }
    if (data?.length) {
        logger.warn(`⚠️ ${data.length} page(s) active(s) résiduelle(s) désactivée(s) : ${data.map(p => p.fb_page_name || p.fb_page_id).join(', ')}`);
    }
};

/**
 * GET /api/facebook/auth/url
 * Génère l'URL OAuth Facebook avec protection CSRF
 */
const getAuthUrl = async (req, res) => {
    try {
        // Sans configuration valide, on renverrait une URL que Meta rejette avec
        // « Impossible de charger cette URL ». Mieux vaut un message exploitable.
        const config = validateFacebookConfig();
        if (!config.valid) {
            config.errors.forEach(e => logger.error(`❌ Config Facebook : ${e}`));
            return res.status(500).json({
                success: false,
                message: 'La connexion Facebook n\'est pas configurée sur le serveur. Contactez le support.'
            });
        }

        // State signé, daté et à usage unique : voir utils/oauthState.js
        const statePayload = createOAuthState(req.user.id);

        // Facebook Login for Business : les permissions sont portées par une
        // configuration créée dans le tableau de bord Meta (config_id), qui
        // remplace scope. Relevé du 8 oct. 2026 : l'app « Entreprise » répondait
        // « Feature Unavailable » au dialogue appelé avec scope. Sans
        // FACEBOOK_LOGIN_CONFIG_ID, on garde l'ancien comportement.
        const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID;

        const params = new URLSearchParams({
            client_id: process.env.FACEBOOK_APP_ID,
            redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
            ...(configId ? { config_id: configId } : { scope: FACEBOOK_SCOPES }),
            response_type: 'code',
            state: statePayload,
            auth_type: 'rerequest'
        });

        const authUrl = `${OAUTH_DIALOG_URL}?${params.toString()}`;

        logger.info(`🔗 URL OAuth générée pour user ${req.user.id}`);
        return res.json({
            success: true,
            data: { authUrl }
        });
    } catch (error) {
        logger.error('❌ Erreur génération URL OAuth:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération de l\'URL OAuth'
        });
    }
};

/**
 * GET /api/facebook/callback
 * Gère le retour OAuth Facebook :
 *   1. Échange code → short-lived token
 *   2. Échange short → long-lived token (60 jours)
 *   3. Récupère infos utilisateur, pages, comptes pub
 *   4. Pour chaque page, détecte Instagram & WhatsApp
 *   5. Sauvegarde toutes les pages en base
 *   6. Redirige vers le dashboard frontend
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

        // Vérifier la signature, l'expiration et l'unicité du state avant de
        // faire quoi que ce soit du userId qu'il transporte. Sans ce contrôle,
        // un state forgé permettrait de rattacher un compte Facebook au compte
        // AdsFacile d'un autre utilisateur.
        const stateVerifie = verifyOAuthState(state);
        if (!stateVerifie.valid) {
            logger.warn(`⚠️ State OAuth rejeté : ${stateVerifie.reason}`);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/dashboard?fb_error=invalid_state`);
        }

        const userId = stateVerifie.userId;

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

        const activeAdAccount = adAccounts.find(a => a.account_status === 1) || adAccounts[0];
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        if (!activeAdAccount) {
            logger.warn(`⚠️ Aucun compte publicitaire trouvé pour user ${userId}`);
            return res.redirect(`${frontendUrl}/dashboard?fb_error=no_ad_account`);
        }

        // Handle no pages case
        if (pages.length === 0) {
            logger.warn(`⚠️ Aucune page trouvée pour user ${userId}`);

            // Facebook renvoie parfois une liste vide dans les secondes qui suivent
            // le consentement, le temps que l'accès aux Pages se propage. Écraser
            // la connexion existante dans ce cas détruit une configuration valide :
            // on la conserve et on signale simplement le retard.
            const { account: existant } = await getActiveAccount(userId, 'fb_page_id, fb_page_name');

            if (existant?.fb_page_id) {
                logger.warn(
                    `⚠️ Connexion existante conservée (page « ${existant.fb_page_name} ») : ` +
                    `Facebook n'a renvoyé aucune page, probablement un délai de propagation.`
                );
                return res.redirect(`${frontendUrl}/dashboard?connected=true&pages_pending=true`);
            }

            // Première connexion sans aucune page : on enregistre le compte publicitaire
            // pour ne pas perdre le jeton, mais sans page associée.
            const encryptedToken = encryptToken(longToken);

            await supabase
                .from('facebook_accounts')
                .delete()
                .eq('user_id', userId);

            await supabase.from('facebook_accounts').insert({
                user_id: userId,
                fb_user_id: fbUser.id,
                fb_account_id: activeAdAccount.id,
                fb_access_token: encryptedToken,
                is_active: true
            });

            tokenHealth.forget(userId);
            return res.redirect(`${frontendUrl}/dashboard?connected=true&no_page=true`);
        }

        // 6. Delete old connections for this user
        // L'identifiant du numéro WhatsApp est saisi par l'utilisateur : l'API
        // ne l'expose pas quand le numéro vit dans un portefeuille auquel
        // l'application n'a pas accès. Comme la reconnexion supprime puis
        // réinsère les lignes, il était perdu à chaque fois, sans que rien ne
        // le signale — et la publicité repartait sans numéro à promouvoir.
        const { data: ancien } = await supabase
            .from('facebook_accounts')
            .select('fb_page_id, whatsapp_phone_number_id')
            .eq('user_id', userId);

        const idsWhatsAppParPage = Object.fromEntries(
            (ancien || [])
                .filter(l => l.whatsapp_phone_number_id)
                .map(l => [l.fb_page_id, l.whatsapp_phone_number_id])
        );

        if (Object.keys(idsWhatsAppParPage).length > 0) {
            logger.info(`💾 Identifiants WhatsApp conservés pour ${Object.keys(idsWhatsAppParPage).length} page(s)`);
        }

        const { error: deleteError } = await supabase
            .from('facebook_accounts')
            .delete()
            .eq('user_id', userId);

        if (deleteError) {
            logger.error('❌ Erreur suppression anciennes connexions:', deleteError);
        }

        // 7. For each page, detect Instagram & WhatsApp and save
        // Get WhatsApp once (it's linked to Business Manager, not per page)
        const whatsapp = await getWhatsAppAccounts(longToken);

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`🔍 INSTAGRAM/WHATSAPP DEBUG — Processing ${pages.length} page(s)`);
        logger.info(`${'='.repeat(80)}`);

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const pageToken = page.access_token || longToken;

            logger.info(`\n📄 PAGE ${i + 1}/${pages.length}`);
            logger.info(`  Name: ${page.name}`);
            logger.info(`  ID: ${page.id}`);
            logger.info(`  Has page-specific token: ${!!page.access_token}`);
            logger.info(`  Token type: ${page.access_token ? 'PAGE TOKEN' : 'USER TOKEN (fallback)'}`);
            logger.info(`  Token length: ${pageToken.length}`);

            // Check Instagram (specific to each page)
            logger.info(`\n📱 CHECKING INSTAGRAM for "${page.name}"...`);
            const instagram = await getConnectedInstagramAccount(page.id, pageToken);

            logger.info(`  📱 Instagram result: ${instagram ? `✅ @${instagram.username} (ID: ${instagram.id})` : '❌ Not found'}`);
            logger.info(`  💬 WhatsApp result: ${whatsapp ? `✅ ${whatsapp.phone_number || whatsapp.verified_name}` : '❌ Not found'}`);

            const encryptedToken = encryptToken(longToken);

            logger.info(`  💾 Saving to DB: instagram_connected=${!!instagram}, whatsapp_connected=${!!whatsapp}`);


            const { error: insertError } = await supabase
                .from('facebook_accounts')
                .insert({
                    user_id: userId,
                    fb_user_id: fbUser.id,
                    fb_account_id: activeAdAccount.id,
                    fb_page_id: page.id,
                    fb_page_name: page.name,
                    fb_access_token: encryptedToken,
                    instagram_connected: !!instagram,
                    instagram_username: instagram?.username || null,
                    instagram_account_id: instagram?.id || null,
                    whatsapp_connected: !!whatsapp && !whatsapp._fallback_business_id,
                    whatsapp_number: (whatsapp && !whatsapp._fallback_business_id) ? whatsapp.phone_number : null,
                    whatsapp_business_id: (whatsapp && !whatsapp._fallback_business_id) ? whatsapp.id : null,
                    fb_business_id: (whatsapp && whatsapp._fallback_business_id) ? whatsapp._fallback_business_id : (whatsapp ? whatsapp.id : null), // Fallback to store business ID for OAuth link
                    whatsapp_phone_number_id: idsWhatsAppParPage[page.id] || null,
                    is_active: i === 0 // First page active by default
                });

            if (insertError) {
                logger.error(`❌ DB INSERT ERROR for page "${page.name}":`);
                logger.error(`  Error message: ${insertError.message}`);
                logger.error(`  Error details: ${JSON.stringify(insertError)}`);
                logger.error(`  Hint: Run the migration SQL in Supabase if columns are missing`);
            } else {
                logger.info(`  ✅ DB insert successful for "${page.name}"`);
            }
        }

        // Filet de sécurité : si la suppression des anciennes lignes n'a rien
        // supprimé (politique RLS, ligne orpheline…), plusieurs pages pourraient
        // rester actives et mettre en défaut toutes les lectures suivantes.
        await enforceSingleActivePage(userId, pages[0].id);

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`✅ CALLBACK COMPLETE — ${pages.length} page(s) saved for user ${userId}`);
        logger.info(`${'='.repeat(80)}`);

        // 8. Redirect with appropriate flags
        const redirectParams = pages.length > 1
            ? 'connected=true&multiple_pages=true'
            : 'connected=true';

        // Nouveau jeton : l'état « révoqué » mis en cache ne vaut plus.
        tokenHealth.forget(userId);
        res.redirect(`${frontendUrl}/dashboard?${redirectParams}`);

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
        const userId = req.user.id;

        const { account: fbAccount, error: fbError } = await getActiveAccount(
            userId,
            'fb_user_id, fb_page_id, fb_page_name, fb_access_token, is_active, created_at, updated_at'
        );

        if (fbError || !fbAccount) {
            return res.json({
                success: true,
                data: { connected: false }
            });
        }

        // Une ligne en base ne prouve pas que Facebook accepte encore le jeton :
        // Meta peut l'invalider à tout moment (mot de passe changé, session
        // réinitialisée). On le lui demande ; valid:null (Meta injoignable)
        // ne vaut pas révocation.
        const jeton = await tokenHealth.checkToken(userId, decryptToken(fbAccount.fb_access_token));

        if (jeton.valid === false) {
            return res.json({
                success: true,
                data: {
                    connected: false,
                    reason: 'revoked',
                    message: tokenHealth.RECONNECT_MESSAGE,
                    pageName: fbAccount.fb_page_name
                }
            });
        }

        return res.json({
            success: true,
            data: {
                connected: true,
                dataAccessExpiresAt: jeton.dataAccessExpiresAt || null,
                pageName: fbAccount.fb_page_name,
                pageId: fbAccount.fb_page_id,
                connectedAt: fbAccount.created_at,
                updatedAt: fbAccount.updated_at
            }
        });
    } catch (error) {
        logger.error('❌ Erreur récupération statut Facebook:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur récupération statut Facebook'
        });
    }
};

/**
 * POST /api/facebook/disconnect
 * Déconnecte le compte Facebook de l'utilisateur
 */
const disconnect = async (req, res) => {
    try {
        const userId = req.user.id;

        const { error: deleteError } = await supabase
            .from('facebook_accounts')
            .delete()
            .eq('user_id', userId);

        if (deleteError) {
            logger.error('❌ Erreur déconnexion Facebook:', deleteError);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de la déconnexion'
            });
        }

        logger.info(`✅ Compte Facebook déconnecté pour user ${userId}`);
        return res.json({
            success: true,
            message: 'Compte Facebook déconnecté'
        });
    } catch (error) {
        logger.error('❌ Erreur déconnexion Facebook:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur déconnexion Facebook'
        });
    }
};

/**
 * GET /api/facebook/connections
 * Retourne le statut de connexion Facebook, Instagram et WhatsApp Business
 */
const getConnectionStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        // Obtenir le compte Facebook actif depuis Supabase
        const { account: fbAccount, error: fbError } = await getActiveAccount(
            userId,
            'fb_page_id, fb_page_name, fb_access_token, fb_user_access_token, fb_business_id, instagram_connected, instagram_username, instagram_account_id, whatsapp_connected, whatsapp_number, whatsapp_business_id, whatsapp_phone_number_id'
        );

        if (fbError || !fbAccount) {
            logger.info('No active Facebook account found');
            return res.json({
                success: true,
                connections: {
                    facebook: { connected: false },
                    hasPage: false,
                    instagram: { connected: false },
                    whatsapp: { connected: false }
                },
                permissions: {
                    hasInstagramPermission: false,
                    hasWhatsAppPermission: false,
                    needsReconnect: false
                }
            });
        }

        const { fb_page_id, fb_page_name, fb_access_token, fb_user_access_token } = fbAccount;

        logger.info(`Getting connection status for page: ${fb_page_name}`);

        let accessToken;
        try {
            // Use user token if available to ensure /me/accounts and /me/permissions calls succeed
            const rawToken = fb_user_access_token || fb_access_token;
            accessToken = decryptToken(rawToken);
            logger.info(`Token decrypted successfully (length: ${accessToken.length})`);
        } catch (decryptError) {
            logger.error('❌ Token decryption error:', decryptError);
            return res.status(500).json({
                success: false,
                message: 'Erreur déchiffrement token'
            });
        }

        // Vérifier si l'utilisateur a des pages
        let pages = [];
        let hasPage = false;

        try {
            pages = await getUserPages(accessToken);
            hasPage = pages.length > 0;
            logger.info(`✅ ${pages.length} page(s) found`);
        } catch (pagesError) {
            logger.error('❌ Error fetching pages:', pagesError.message || pagesError);
            logger.error('Error details:', pagesError.response?.data || 'No response data');
            // Don't fail the whole request - just set hasPage to false
            hasPage = false;
            pages = [];
        }

        // Vérifier les permissions accordées
        let hasInstagramPermission = false;
        let hasWhatsAppPermission = false;

        try {
            const perms = await getUserPermissions(accessToken);
            const grantedPerms = perms
                .filter(p => p.status === 'granted')
                .map(p => p.permission);

            hasInstagramPermission = grantedPerms.includes('instagram_basic') ||
                grantedPerms.includes('instagram_manage_insights');
            hasWhatsAppPermission = grantedPerms.includes('whatsapp_business_management');

            logger.info(`✅ Granted permissions: ${grantedPerms.join(', ')}`);
        } catch (permError) {
            logger.error('❌ Error checking permissions:', permError.message || permError);
            logger.error('Error response:', permError.response?.data || 'No response data');
            // Don't fail - just set to false
        }

        // Use DB-stored values for Instagram/WhatsApp (avoids live API calls)
        const instagram = fbAccount.instagram_connected ? {
            username: fbAccount.instagram_username,
            id: fbAccount.instagram_account_id
        } : null;

        const whatsapp = fbAccount.whatsapp_connected ? {
            phone_number: fbAccount.whatsapp_number,
            id: fbAccount.whatsapp_business_id
        } : { business_id: fbAccount.fb_business_id };

        logger.info(`📱 Instagram: ${instagram ? `@${instagram.username}` : 'Not connected'}`);
        logger.info(`💬 WhatsApp: ${fbAccount.whatsapp_connected ? whatsapp.phone_number : (fbAccount.fb_business_id ? 'Not connected (Fallback ID ready)' : 'Not connected')}`);

        return res.json({
            success: true,
            connections: {
                facebook: {
                    connected: true,
                    pageName: fb_page_name,
                    pageId: fb_page_id
                },
                hasPage,
                pages: pages.map(p => ({ id: p.id, name: p.name })),
                instagram: instagram ? {
                    connected: true,
                    username: instagram.username,
                    id: instagram.id
                } : { connected: false },
                whatsapp: fbAccount.whatsapp_connected ? {
                    connected: true,
                    phoneNumber: whatsapp.phone_number,
                    // Identifiant du numéro : c'est lui que les publicités
                    // promeuvent, le numéro seul ne rattache rien.
                    phoneNumberId: fbAccount.whatsapp_phone_number_id || null,
                    id: whatsapp.id
                } : { connected: false, business_id: whatsapp.business_id }
            },
            permissions: {
                hasInstagramPermission,
                hasWhatsAppPermission,
                needsReconnect: (!hasInstagramPermission || !hasWhatsAppPermission) && hasPage
            }
        });

    } catch (error) {
        if (tokenHealth.respondIfRevoked(res, error, req.user.id)) return;
        logger.error('❌ Erreur récupération statut connexions:', error.message);
        logger.error('Stack trace:', error.stack);
        return res.status(500).json({
            success: false,
            message: 'Erreur récupération statut connexions'
        });
    }
};

/**
 * GET /api/facebook/permissions
 * Retourne les permissions Facebook de l'utilisateur
 */
const getPermissions = async (req, res) => {
    try {
        const userId = req.user.id;

        const { account: fbAccount, error: fbError } = await getActiveAccount(userId, 'fb_access_token');

        if (fbError || !fbAccount) {
            return res.json({ success: true, permissions: [] });
        }

        const accessToken = decryptToken(fbAccount.fb_access_token);
        const permissions = await getUserPermissions(accessToken);

        return res.json({
            success: true,
            permissions
        });
    } catch (error) {
        if (tokenHealth.respondIfRevoked(res, error, req.user.id)) return;
        logger.error('❌ Erreur récupération permissions Facebook:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur récupération permissions Facebook'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-PAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/facebook/pages
 * Retourne toutes les pages Facebook de l'utilisateur
 */
const getUserAllPages = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: pages, error } = await supabase
            .from('facebook_accounts')
            .select('fb_page_id, fb_page_name, is_active, instagram_connected, instagram_username, whatsapp_connected, whatsapp_number, created_at')
            .eq('user_id', userId)
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('❌ Erreur récupération pages:', error);
            return res.status(500).json({ success: false, message: 'Erreur récupération pages' });
        }

        const activePage = (pages || []).find(p => p.is_active) || null;

        logger.info(`📄 ${(pages || []).length} page(s) pour user ${userId}`);

        return res.json({
            success: true,
            pages: pages || [],
            activePage
        });
    } catch (error) {
        logger.error('❌ Erreur getUserAllPages:', error);
        return res.status(500).json({ success: false, message: 'Erreur récupération pages' });
    }
};

/**
 * POST /api/facebook/switch-page
 * Change la page active de l'utilisateur
 */
const switchActivePage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page_id } = req.body;

        if (!page_id) {
            return res.status(400).json({ success: false, message: 'Page ID requis' });
        }

        // SECURITY: Verify page belongs to user
        const { data: pageCheck, error: checkError } = await supabase
            .from('facebook_accounts')
            .select('fb_page_name')
            .eq('user_id', userId)
            .eq('fb_page_id', page_id)
            .limit(1)
            .maybeSingle();

        if (checkError || !pageCheck) {
            logger.error(`⚠️ User ${userId} tried to access page ${page_id} they don't own`);
            return res.status(403).json({ success: false, message: 'Page introuvable ou accès refusé' });
        }

        // Deactivate all pages for this user
        await supabase
            .from('facebook_accounts')
            .update({ is_active: false })
            .eq('user_id', userId);

        // Activate selected page
        await supabase
            .from('facebook_accounts')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('fb_page_id', page_id);

        logger.info(`✅ User ${userId} switched to page: ${pageCheck.fb_page_name}`);

        return res.json({
            success: true,
            message: 'Page active changée',
            activePage: pageCheck.fb_page_name
        });
    } catch (error) {
        logger.error('❌ Erreur switchActivePage:', error);
        return res.status(500).json({ success: false, message: 'Erreur changement page' });
    }
};

/**
 * POST /api/facebook/refresh-connections
 * Actualise les connexions Instagram/WhatsApp pour la page active
 */
const refreshConnections = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get active page
        const { account: fbAccount, error: fbError } = await getActiveAccount(
            userId,
            'fb_page_id, fb_page_name, fb_access_token'
        );

        if (fbError || !fbAccount) {
            return res.status(404).json({ success: false, message: 'Aucune page active trouvée' });
        }

        const { fb_page_id, fb_page_name, fb_access_token } = fbAccount;
        const accessToken = decryptToken(fb_access_token);

        logger.info(`🔄 Refreshing connections for page: ${fb_page_name}`);

        // Re-check Instagram and WhatsApp in parallel
        const [instagram, whatsapp] = await Promise.all([
            getConnectedInstagramAccount(fb_page_id, accessToken),
            getWhatsAppAccounts(accessToken)
        ]);

        // Update database
        const { error: updateError } = await supabase
            .from('facebook_accounts')
            .update({
                instagram_connected: !!instagram,
                instagram_username: instagram?.username || null,
                instagram_account_id: instagram?.id || null,
                whatsapp_connected: !!whatsapp && !whatsapp._fallback_business_id,
                whatsapp_number: (whatsapp && !whatsapp._fallback_business_id) ? whatsapp.phone_number : null,
                whatsapp_business_id: (whatsapp && !whatsapp._fallback_business_id) ? whatsapp.id : null,
                fb_business_id: (whatsapp && whatsapp._fallback_business_id) ? whatsapp._fallback_business_id : (whatsapp ? whatsapp.id : null),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('fb_page_id', fb_page_id);

        if (updateError) {
            logger.error('❌ Erreur mise à jour connexions:', updateError);
        }

        logger.info('✅ Connections refreshed:');
        logger.info(`  📱 Instagram: ${instagram ? `@${instagram.username}` : '❌'}`);
        logger.info(`  💬 WhatsApp: ${whatsapp && !whatsapp._fallback_business_id ? whatsapp.phone_number : (whatsapp && whatsapp._fallback_business_id ? 'Not connected (Fallback ID ready)' : '❌')}`);

        return res.json({
            success: true,
            message: 'Connexions actualisées',
            connections: {
                instagram: instagram ? {
                    connected: true,
                    username: instagram.username,
                    id: instagram.id
                } : { connected: false },
                whatsapp: whatsapp && !whatsapp._fallback_business_id ? {
                    connected: true,
                    phoneNumber: whatsapp.phone_number,
                    id: whatsapp.id
                } : { connected: false, business_id: whatsapp && whatsapp._fallback_business_id ? whatsapp._fallback_business_id : null }
            }
        });
    } catch (error) {
        logger.error('❌ Erreur refreshConnections:', error);
        return res.status(500).json({ success: false, message: 'Erreur actualisation connexions' });
    }
};

/**
 * GET /api/facebook/pixels
 * Ensembles de données (pixels) du compte publicitaire actif.
 *
 * Sert le bloc « Conversion » du wizard : quand le compte n'a qu'un seul pixel,
 * l'interface le retient sans rien demander ; quand il n'en a aucun, elle cesse
 * de proposer l'optimisation sur les achats plutôt que de la faire échouer à la
 * création.
 */
const getPixels = async (req, res) => {
    try {
        const userId = req.user.id;

        const { account, error } = await getActiveAccount(
            userId, 'fb_account_id, fb_access_token'
        );

        if (error || !account) {
            return res.status(404).json({
                success: false,
                message: 'Compte Facebook non connecté.'
            });
        }

        const pixels = await getAdAccountPixels(
            account.fb_account_id, decryptToken(account.fb_access_token)
        );

        logger.info(`📊 ${pixels.length} ensemble(s) de données pour user ${userId}`);

        return res.json({ success: true, data: { pixels } });
    } catch (error) {
        logger.error('❌ Erreur getPixels:', error.message);
        return res.status(502).json({
            success: false,
            message: error.message || 'Erreur récupération des ensembles de données'
        });
    }
};

/**
 * GET /api/facebook/ad-accounts
 * Comptes publicitaires du jeton, avec leur statut et leurs ensembles de données.
 *
 * Le compte était choisi une fois pour toutes à la connexion — le premier
 * actif — sans jamais être montré ni modifiable. Un utilisateur dont les pixels
 * vivent sur un autre compte n'avait aucun moyen de le comprendre, ni d'en
 * changer.
 */
const getAdAccountsForUser = async (req, res) => {
    try {
        const userId = req.user.id;

        const { account, error } = await getActiveAccount(
            userId, 'fb_account_id, fb_access_token'
        );

        if (error || !account) {
            return res.status(404).json({ success: false, message: 'Compte Facebook non connecté.' });
        }

        const token = decryptToken(account.fb_access_token);
        const comptes = await getAdAccounts(token);

        // Le nombre d'ensembles de données est ce qui permet de choisir : sans
        // lui, l'utilisateur ne peut que deviner où vivent ses pixels.
        const enrichis = await Promise.all(comptes.map(async (c) => {
            const statut = describeAdAccountStatus(c.account_status);
            let pixels = null;

            try {
                pixels = (await getAdAccountPixels(c.id, token)).length;
            } catch {
                pixels = null;   // le compte refuse la lecture : on n'affiche rien
            }

            return {
                id: c.id,
                name: c.name,
                currency: c.currency,
                status_label: statut.label,
                usable: statut.usable,
                pixels_count: pixels,
                is_active: c.id === account.fb_account_id
            };
        }));

        return res.json({
            success: true,
            data: { ad_accounts: enrichis, active_id: account.fb_account_id }
        });
    } catch (error) {
        if (tokenHealth.respondIfRevoked(res, error, req.user.id)) return;
        logger.error('❌ Erreur getAdAccountsForUser:', error.message);
        return res.status(502).json({
            success: false,
            message: 'Erreur récupération des comptes publicitaires'
        });
    }
};

/**
 * POST /api/facebook/switch-ad-account
 * Change le compte publicitaire sur lequel partent les campagnes.
 *
 * Deux garde-fous : le compte doit appartenir au jeton de l'utilisateur — sans
 * quoi on écrirait un identifiant arbitraire en base — et il doit être en état
 * de diffuser. Laisser choisir un compte désactivé déplacerait l'échec à la
 * création de la campagne, après que tout a été saisi.
 */
const switchAdAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        const { ad_account_id } = req.body;

        if (!ad_account_id) {
            return res.status(400).json({ success: false, message: 'Identifiant de compte publicitaire requis' });
        }

        const { account, error } = await getActiveAccount(
            userId, 'fb_access_token'
        );

        if (error || !account) {
            return res.status(404).json({ success: false, message: 'Compte Facebook non connecté.' });
        }

        const token = decryptToken(account.fb_access_token);
        const comptes = await getAdAccounts(token);
        const cible = comptes.find(c => c.id === ad_account_id);

        if (!cible) {
            logger.warn(`⚠️ User ${userId} a demandé le compte ${ad_account_id}, absent de son jeton`);
            return res.status(403).json({
                success: false,
                message: 'Ce compte publicitaire n\'est pas accessible avec votre connexion Facebook.'
            });
        }

        const statut = describeAdAccountStatus(cible.account_status);
        if (!statut.usable) {
            return res.status(400).json({
                success: false,
                message: `Le compte « ${cible.name} » est ${statut.label.toLowerCase()} : `
                    + 'Meta n\'y autorise aucune création de publicité.'
            });
        }

        const { error: majError } = await supabase
            .from('facebook_accounts')
            .update({ fb_account_id: cible.id, updated_at: new Date().toISOString() })
            .eq('user_id', userId);

        if (majError) {
            logger.error('❌ Erreur switchAdAccount:', majError.message);
            return res.status(500).json({ success: false, message: 'Erreur changement de compte publicitaire' });
        }

        logger.info(`✅ User ${userId} bascule sur le compte publicitaire ${cible.id} (${cible.name})`);

        return res.json({
            success: true,
            message: `Compte publicitaire « ${cible.name} » sélectionné`,
            data: { id: cible.id, name: cible.name }
        });
    } catch (error) {
        logger.error('❌ Erreur switchAdAccount:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur changement de compte publicitaire' });
    }
};

module.exports = {
    getActiveAccount,
    getPixels,
    getAdAccountsForUser,
    switchAdAccount,
    enforceSingleActivePage,
    getAuthUrl,
    handleCallback,
    getStatus,
    disconnect,
    getConnectionStatus,
    getPermissions,
    getUserAllPages,
    switchActivePage,
    refreshConnections
};
