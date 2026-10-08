/**
 * Contrôleur Campaigns — CRUD + Facebook Ads Integration
 * AdsFacile Backend
 * 
 * Flow Facebook : Campaign → Ad Set → Ad
 */

const { supabase, supabaseAdmin, serviceRoleConfigured } = require('../config/supabase');
const facebookAdsService = require('../services/facebookAdsService');
const { isMessagingDestination, normalizeApps } = require('../services/messagingDestinations');
const { translateFacebookError } = require('../utils/facebookErrors');
const { minDailyBudgetFcfa } = require('../utils/currency');
const logger = require('../utils/logger');
const campaignJobs = require('../services/campaignJobs');
const sharp = require('sharp');
const { checkImage, checkMediaItems, VIDEO_MAX_BYTES } = require('../utils/mediaSpecs');
const fs = require('fs');
const path = require('path');

// Limites par plan
const PLAN_LIMITS = {
    free: 1,
    starter: 5,
    pro: 999999,
    agency: 999999
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie la limite de campagnes du plan
 */
async function checkCampaignLimit(userId, plan) {
    const max = PLAN_LIMITS[plan] || 1;

    const { count, error } = await supabase
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

    if (error) {
        logger.error('Erreur vérification limite campagnes:', error);
        return { allowed: true, current: 0, max };
    }

    const current = count || 0;
    return {
        allowed: current < max,
        current,
        max
    };
}

/**
 * Valide les données de campagne
 */
function validateCampaignData(data) {
    const errors = [];

    // Campaign level
    if (!data.objective) errors.push('L\'objectif est requis');
    if (!data.campaign_name || data.campaign_name.trim().length === 0) {
        errors.push('Le nom de la campagne est requis');
    }
    if (data.campaign_name && data.campaign_name.length > 255) {
        errors.push('Le nom de la campagne ne doit pas dépasser 255 caractères');
    }

    // Ad Set level
    if (!data.targeting || !data.targeting.locations || data.targeting.locations.length === 0) {
        errors.push('Au moins une localisation est requise');
    }
    if (data.targeting) {
        if (data.targeting.age_min && (data.targeting.age_min < 18 || data.targeting.age_min > 65)) {
            errors.push('L\'âge minimum doit être entre 18 et 65');
        }
        if (data.targeting.age_max && (data.targeting.age_max < 18 || data.targeting.age_max > 65)) {
            errors.push('L\'âge maximum doit être entre 18 et 65');
        }
        // Chaque borne était vérifiée isolément : un minimum de 60 avec un
        // maximum de 20 passait, et produisait une audience vide.
        if (data.targeting.age_min && data.targeting.age_max
            && Number(data.targeting.age_min) > Number(data.targeting.age_max)) {
            errors.push('L\'âge minimum ne peut pas dépasser l\'âge maximum');
        }
    }
    // Le seuil était codé en dur à 1000 FCFA alors que le service applique
    // minDailyBudgetFcfa(), calculé depuis le taux de change. Les deux
    // pouvaient diverger : le contrôleur refusait un budget que Meta aurait
    // accepté, ou laissait passer un budget que le service rejetait ensuite.
    const minBudget = minDailyBudgetFcfa();
    if (!data.daily_budget || Number(data.daily_budget) < minBudget) {
        errors.push(`Le budget minimum est de ${minBudget} FCFA par jour`);
    }

    // Calendrier
    if (data.start_date && data.end_date
        && new Date(data.end_date) <= new Date(data.start_date)) {
        errors.push('La date de fin doit être postérieure à la date de début');
    }

    // Meta exige une date de fin avec un budget total : sans elle, le service
    // échoue après avoir créé la campagne.
    if (data.budget_type === 'lifetime' && !data.end_date) {
        errors.push('Un budget total demande une date de fin');
    }

    // Une publicité qui ouvre une conversation n'a pas d'URL de destination :
    // c'est Facebook qui redirige vers Messenger, Instagram ou WhatsApp.
    const messagingApps = normalizeApps(data.messaging_destinations);
    const goesToMessaging = messagingApps.length > 0
        || isMessagingDestination(data.destination_type);

    // Ad level
    if (!data.creative) {
        errors.push('Les données créatives sont requises');
    } else {
        if (!data.creative.message || data.creative.message.trim().length === 0) {
            errors.push('Le texte de la publicité est requis');
        }
        if (!goesToMessaging
            && (!data.creative.headline || data.creative.headline.trim().length === 0)) {
            errors.push('Le titre est requis');
        }
        if (!goesToMessaging && !data.creative.link) {
            errors.push('L\'URL de destination est requise');
        }

        // Médias : refuser avant de créer quoi que ce soit chez Meta.
        const mediaType = data.creative.media_type;
        if (mediaType === 'video' && !data.creative.media_url) {
            errors.push('Ajoutez une vidéo pour cette publicité');
        }
        errors.push(...checkMediaItems(mediaType, data.creative.media_items));
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE CAMPAIGN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crée une campagne complète (3 niveaux Facebook)
 */
/**
 * Traduit une erreur de création en réponse HTTP (statut + corps), sans
 * l'envoyer : le suivi de création la garde pour la montrer à l'écran.
 */
function describeCreationError(error) {
    // Incohérence détectée par AdsFacile avant même d'appeler Facebook
    // (destination de messagerie non reliée, visuel manquant…).
    if (error.userFacing) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'validation_error',
                message: error.message,
                details: error.validationErrors || [error.message]
            }
        };
    }

    // Erreur Facebook API, traduite en message actionnable
    if (error.response?.error) {
        const translated = translateFacebookError(error.response.error);
        return {
            status: 400,
            body: {
                success: false,
                error: 'facebook_api_error',
                message: translated.message,
                title: translated.title,
                fix: translated.fix,
                code: translated.code,
                fb_error_subcode: translated.subcode
            }
        };
    }

    return {
        status: 500,
        body: {
            success: false,
            error: 'server_error',
            message: error.message || 'Erreur lors de la création de la campagne'
        }
    };
}

/**
 * POST /api/campaigns — lance la création et répond tout de suite (202).
 *
 * La création peut durer plusieurs minutes (Meta traite chaque vidéo) : la tenir
 * dans une seule requête échouait sur l'hébergement et affichait une erreur
 * alors que la campagne existait. L'écran suit ensuite l'avancement avec
 * GET /campaigns/jobs/:id. L'en-tête `Idempotency-Key` empêche qu'un double
 * clic ou un nouvel essai crée une seconde campagne.
 */
const createCampaign = async (req, res) => {
    try {
        const userId = req.user.id;
        const data = req.body;
        const key = (typeof req.get === 'function' ? req.get('Idempotency-Key') : null) || null;

        // Même soumission déjà reçue : on renvoie la même création.
        const deja = campaignJobs.findByKey(userId, key);
        if (deja) {
            return res.status(202).json({ success: true, data: { job_id: deja.id } });
        }

        // 1. Vérifier limite plan — les créations en cours comptent : elles ne
        // sont enregistrées en base qu'à la toute fin.
        const limit = await checkCampaignLimit(userId, req.user.plan);
        const enCours = campaignJobs.countRunning(userId);
        if (!limit.allowed || limit.current + enCours >= limit.max) {
            return res.status(403).json({
                success: false,
                error: 'limit_reached',
                message: `Limite de ${limit.max} campagne(s)/mois atteinte`,
                current_count: limit.current + enCours,
                max_count: limit.max,
                upgrade_url: '/billing'
            });
        }

        // 2. Valider données
        const validation = validateCampaignData(data);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'validation_error',
                message: 'Données de campagne invalides',
                details: validation.errors
            });
        }

        // 3. Créer campagne Facebook (3 niveaux) en arrière-plan
        campaignJobs.purge();
        const job = campaignJobs.create({ userId, key });

        Promise.resolve()
            .then(() => facebookAdsService.createFullCampaign(userId, data, {
                onStep: (name, detail = {}) => campaignJobs.update(job.id, { step: { name, ...detail } })
            }))
            .then((result) => {
                logger.info(`✅ Campagne créée par user ${userId}: ${result.campaign_id}`);
                campaignJobs.update(job.id, { status: 'done', result, step: null });
            })
            .catch((error) => {
                logger.error('❌ Campaign creation error:', error);
                const { status, body } = describeCreationError(error);
                campaignJobs.update(job.id, { status: 'failed', error: body, httpStatus: status, step: null });
            });

        return res.status(202).json({ success: true, data: { job_id: job.id } });

    } catch (error) {
        logger.error('❌ Campaign creation error:', error);
        const { status, body } = describeCreationError(error);
        return res.status(status).json(body);
    }
};

/**
 * GET /api/campaigns/jobs/:id — avancement d'une création (propriétaire seulement).
 */
const getCreationJob = async (req, res) => {
    const job = campaignJobs.get(req.params.id, req.user.id);
    if (!job) {
        return res.status(404).json({
            success: false,
            message: 'Création introuvable. Elle a peut-être déjà abouti : vérifiez la liste de vos campagnes.'
        });
    }

    return res.json({
        success: true,
        data: {
            status: job.status,
            step: job.step,
            result: job.result,
            error: job.error,
            http_status: job.httpStatus || null
        }
    });
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIST CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

const listCampaigns = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        let query = supabase
            .from('campaigns')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data: campaigns, error } = await query;

        if (error) {
            logger.error('Erreur listCampaigns:', error);
            return res.status(500).json({ success: false, message: 'Erreur serveur' });
        }

        // Infos plan
        const limit = await checkCampaignLimit(userId, req.user.plan);

        return res.json({
            success: true,
            data: {
                campaigns: campaigns || [],
                total: (campaigns || []).length,
                campaigns_this_month: limit.current,
                plan_limit: limit.max,
                can_create: limit.allowed
            }
        });

    } catch (error) {
        logger.error('❌ listCampaigns error:', error);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET CAMPAIGN DETAILS
// ═══════════════════════════════════════════════════════════════════════════════

const getCampaignDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data: campaign, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !campaign) {
            return res.status(404).json({ success: false, message: 'Campagne non trouvée' });
        }

        return res.json({ success: true, data: campaign });
    } catch (error) {
        logger.error('❌ getCampaignDetails error:', error);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE STATUS (pause/resume)
// ═══════════════════════════════════════════════════════════════════════════════

const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        if (!['active', 'paused'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Statut invalide (active ou paused)' });
        }

        // Vérifier que la campagne appartient à l'utilisateur
        const { data: campaign, error: fetchError } = await supabase
            .from('campaigns')
            .select('id, fb_campaign_id, fb_adset_id, fb_ad_id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !campaign) {
            return res.status(404).json({ success: false, message: 'Campagne non trouvée' });
        }

        // Appliquer le statut chez Facebook AVANT la base : sans cela, AdsFacile
        // afficherait « active » pendant que la campagne reste en pause côté
        // Meta, et l'utilisateur croirait diffuser sans rien diffuser.
        try {
            await facebookAdsService.updateCampaignStatus(userId, campaign, status);
        } catch (fbErr) {
            logger.error('❌ Statut non appliqué chez Facebook:', fbErr.response?.data || fbErr.message);
            const translated = fbErr.response?.data?.error
                ? translateFacebookError(fbErr.response.data.error)
                : { title: 'Erreur Facebook', message: fbErr.message, fix: null };

            return res.status(400).json({
                success: false,
                error: 'facebook_api_error',
                title: translated.title,
                message: `Le statut n'a pas pu être modifié sur Facebook. ${translated.message}`,
                fix: translated.fix
            });
        }

        // Mettre à jour en base
        const { data: updated, error: updateError } = await supabase
            .from('campaigns')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({ success: false, message: 'Erreur mise à jour' });
        }

        // Audit log
        // Même défaut que dans deleteCampaign : .catch n'existe pas sur le
        // constructeur Supabase, et l'exception remontait en erreur 500 alors
        // que le statut avait bien été changé.
        try {
            await supabase.from('audit_logs').insert({
                user_id: userId,
                action: `campaign_${status}`,
                details: { campaign_id: id }
            });
        } catch (auditErr) {
            logger.warn('⚠️ Journal d\'audit non écrit:', auditErr.message);
        }

        return res.json({ success: true, data: updated });
    } catch (error) {
        logger.error('❌ updateStatus error:', error);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE CAMPAIGN
// ═══════════════════════════════════════════════════════════════════════════════

const deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data: campaign } = await supabase
            .from('campaigns')
            .select('id, fb_campaign_id, fb_adset_id, fb_ad_id, fb_creative_id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        // Supprimer chez Facebook AVANT la base. L'inverse effacerait la seule
        // trace de la campagne tout en la laissant vivre chez Meta : elle
        // disparaîtrait du tableau de bord en continuant de dépenser, sans plus
        // aucun moyen de la retrouver depuis AdsFacile.
        if (campaign?.fb_campaign_id) {
            try {
                await facebookAdsService.deleteCampaignOnFacebook(userId, campaign);
            } catch (fbErr) {
                logger.error('❌ Suppression refusée par Facebook:', fbErr.response?.data || fbErr.message);
                const translated = fbErr.response?.data?.error
                    ? translateFacebookError(fbErr.response.data.error)
                    : { title: 'Erreur Facebook', message: fbErr.message };

                return res.status(400).json({
                    success: false,
                    error: 'facebook_api_error',
                    title: translated.title,
                    message: `La campagne n'a pas pu être supprimée sur Facebook. ${translated.message}`
                });
            }
        }

        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            return res.status(500).json({ success: false, message: 'Erreur suppression' });
        }

        // Le constructeur Supabase est « thenable » mais n'expose pas .catch :
        // l'appeler ainsi levait « .catch is not a function », renvoyant une
        // erreur 500 alors que la suppression avait déjà eu lieu.
        try {
            await supabase.from('audit_logs').insert({
                user_id: userId,
                action: 'campaign_deleted',
                details: { campaign_id: id }
            });
        } catch (auditErr) {
            logger.warn('⚠️ Journal d\'audit non écrit:', auditErr.message);
        }

        return res.json({ success: true, message: 'Campagne supprimée' });
    } catch (error) {
        logger.error('❌ deleteCampaign error:', error);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD MEDIA
// ═══════════════════════════════════════════════════════════════════════════════

const uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
        }

        const file = req.file;
        const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
        const mesures = { type };

        // Mesurer l'image ici : un refus de Meta n'arriverait qu'à la toute
        // fin, après la création de la campagne et de l'ensemble.
        if (type === 'image') {
            let meta;
            try {
                meta = await sharp(file.buffer).metadata();
            } catch {
                return res.status(400).json({ success: false, message: 'Image illisible : utilisez un JPG ou un PNG.' });
            }
            const { errors } = checkImage({ width: meta.width, height: meta.height, size: file.size });
            if (errors.length) {
                return res.status(400).json({ success: false, message: errors[0], details: errors });
            }
            Object.assign(mesures, {
                width: meta.width,
                height: meta.height,
                ratio: Math.round((meta.width / meta.height) * 1000) / 1000
            });
        } else if (file.size > VIDEO_MAX_BYTES) {
            return res.status(400).json({ success: false, message: 'Vidéo trop lourde : 50 Mo maximum.' });
        }

        const fileExt = path.extname(file.originalname);
        const fileName = `${req.user.id}_${Date.now()}${fileExt}`;
        const filePath = `ad-creatives/${fileName}`;

        // Dépôt avec le client serveur : la politique du bucket réserve les
        // insertions au rôle « authenticated », la clé anon est refusée (403).
        const { data, error } = await supabaseAdmin.storage
            .from('campaign-media')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (error) {
            logger.error('Erreur Supabase upload:', error);
            return res.status(500).json({
                success: false,
                message: serviceRoleConfigured === false
                    ? 'Le dépôt des visuels n\'est pas configuré sur le serveur (clé de service absente). Contactez le support.'
                    : 'Erreur lors de l\'upload'
            });
        }

        // Récupérer le lien public
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('campaign-media')
            .getPublicUrl(filePath);

        return res.json({
            success: true,
            url: publicUrl,
            ...mesures,
            message: 'Fichier uploadé avec succès'
        });

    } catch (error) {
        logger.error('❌ uploadMedia error:', error);
        return res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'upload' });
    }
};

module.exports = {
    createCampaign,
    getCreationJob,
    listCampaigns,
    getCampaignDetails,
    updateStatus,
    deleteCampaign,
    uploadMedia
};
