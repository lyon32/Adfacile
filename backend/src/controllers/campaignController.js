/**
 * Contrôleur Campaigns — CRUD + Facebook Ads Integration
 * AdsFacile Backend
 * 
 * Flow Facebook : Campaign → Ad Set → Ad
 */

const { supabase } = require('../config/supabase');
const facebookAdsService = require('../services/facebookAdsService');
const logger = require('../utils/logger');
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
    }
    if (!data.daily_budget || data.daily_budget < 1000) {
        errors.push('Le budget minimum est de 1000 FCFA');
    }

    // Ad level
    if (!data.creative) {
        errors.push('Les données créatives sont requises');
    } else {
        if (!data.creative.message || data.creative.message.trim().length === 0) {
            errors.push('Le texte de la publicité est requis');
        }
        if (!data.creative.headline || data.creative.headline.trim().length === 0) {
            errors.push('Le titre est requis');
        }
        if (!data.creative.link) {
            errors.push('L\'URL de destination est requise');
        }
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
const createCampaign = async (req, res) => {
    try {
        const userId = req.user.id;
        const data = req.body;

        // 1. Vérifier limite plan
        const limit = await checkCampaignLimit(userId, req.user.plan);
        if (!limit.allowed) {
            return res.status(403).json({
                success: false,
                error: 'limit_reached',
                message: `Limite de ${limit.max} campagne(s)/mois atteinte`,
                current_count: limit.current,
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

        // 3. Créer campagne Facebook (3 niveaux)
        const result = await facebookAdsService.createFullCampaign(userId, data);

        // 4. Logger dans audit
        logger.info(`✅ Campagne créée par user ${userId}: ${result.campaign_id}`);

        return res.status(201).json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('❌ Campaign creation error:', error);

        // Erreur Facebook API
        if (error.response?.error) {
            return res.status(400).json({
                success: false,
                error: 'facebook_api_error',
                message: error.response.error.message || 'Erreur Facebook API',
                code: error.response.error.code,
                fb_error_subcode: error.response.error.error_subcode
            });
        }

        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: error.message || 'Erreur lors de la création de la campagne'
        });
    }
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
            .select('id, fb_campaign_id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !campaign) {
            return res.status(404).json({ success: false, message: 'Campagne non trouvée' });
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
        await supabase.from('audit_logs').insert({
            user_id: userId,
            action: `campaign_${status}`,
            details: { campaign_id: id }
        }).catch(() => { });

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

        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            return res.status(500).json({ success: false, message: 'Erreur suppression' });
        }

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'campaign_deleted',
            details: { campaign_id: id }
        }).catch(() => { });

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
        const fileExt = path.extname(file.originalname);
        const fileName = `${req.user.id}_${Date.now()}${fileExt}`;
        const filePath = `ad-creatives/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('campaign-media')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (error) {
            logger.error('Erreur Supabase upload:', error);
            return res.status(500).json({ success: false, message: 'Erreur lors de l\'upload' });
        }

        // Récupérer le lien public
        const { data: { publicUrl } } = supabase.storage
            .from('campaign-media')
            .getPublicUrl(filePath);

        return res.json({
            success: true,
            url: publicUrl,
            message: 'Fichier uploadé avec succès'
        });

    } catch (error) {
        logger.error('❌ uploadMedia error:', error);
        return res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'upload' });
    }
};

module.exports = {
    createCampaign,
    listCampaigns,
    getCampaignDetails,
    updateStatus,
    deleteCampaign,
    uploadMedia
};
