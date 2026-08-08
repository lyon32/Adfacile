/**
 * Facebook Ads Service — Marketing API Integration
 * AdsFacile Backend
 * 
 * Crée le flow complet : Campaign → Ad Set → Ad
 * via la Facebook Marketing API
 */

const axios = require('axios');
const { supabase } = require('../config/supabase');
const { decryptToken } = require('./facebookService');
const logger = require('../utils/logger');

const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mappe l'objectif campagne vers l'optimization goal Facebook
 */
function getOptimizationGoal(objective) {
    const goals = {
        'OUTCOME_TRAFFIC': 'LINK_CLICKS',
        'OUTCOME_ENGAGEMENT': 'POST_ENGAGEMENT',
        'OUTCOME_LEADS': 'LEAD_GENERATION',
        'OUTCOME_SALES': 'OFFSITE_CONVERSIONS',
        'OUTCOME_AWARENESS': 'REACH',
        'OUTCOME_APP_PROMOTION': 'APP_INSTALLS'
    };
    return goals[objective] || 'LINK_CLICKS';
}

/**
 * Construit l'objet targeting Facebook à partir des données app.
 * 
 * targeting.locations  — array of { key, name, type, country_code } from Facebook Targeting API
 * targeting.interests  — array of { id, name } from Facebook Targeting API
 */
function buildTargeting(targeting) {
    const result = {
        age_min: targeting.age_min || 18,
        age_max: targeting.age_max || 65
    };

    // ═══════════════════════════════════════════════════════════════════
    // GÉO-LOCALISATION avec location keys de Facebook
    // ═══════════════════════════════════════════════════════════════════
    const geoLocations = {};

    if (targeting.locations && targeting.locations.length > 0) {
        const countries = [];
        const cities = [];
        const regions = [];
        const geoMarkets = [];

        targeting.locations.forEach(loc => {
            // loc is an object: { key, name, type, country_code }
            if (loc.type === 'country') {
                countries.push(loc.country_code || loc.key);
            } else if (loc.type === 'city') {
                cities.push({ key: loc.key, radius: 25, distance_unit: 'kilometer' });
            } else if (loc.type === 'region') {
                regions.push({ key: loc.key });
            } else if (loc.type === 'geo_market') {
                geoMarkets.push({ key: loc.key });
            } else {
                // Default: treat as city
                cities.push({ key: loc.key, radius: 25, distance_unit: 'kilometer' });
            }
        });

        if (countries.length > 0) geoLocations.countries = countries;
        if (cities.length > 0) geoLocations.cities = cities;
        if (regions.length > 0) geoLocations.regions = regions;
        if (geoMarkets.length > 0) geoLocations.geo_markets = geoMarkets;
    }

    // Fallback: if no locations, target Cameroon
    if (!geoLocations.countries && !geoLocations.cities && !geoLocations.regions) {
        geoLocations.countries = ['CM'];
    }

    result.geo_locations = geoLocations;

    // ═══════════════════════════════════════════════════════════════════
    // INTÉRÊTS avec IDs de Facebook
    // ═══════════════════════════════════════════════════════════════════
    if (targeting.interests && targeting.interests.length > 0) {
        // interests is now array of { id, name }
        result.flexible_spec = [
            {
                interests: targeting.interests.map(i => ({
                    id: i.id,
                    name: i.name
                }))
            }
        ];
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RÉCUPÉRATION DES CREDENTIALS FACEBOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère les credentials Facebook d'un utilisateur depuis la DB
 */
async function getFacebookAccount(userId) {
    logger.info(`🔍 getFacebookAccount: Looking for facebook_accounts with user_id=${userId}, is_active=true`);

    const { data, error } = await supabase
        .from('facebook_accounts')
        .select('fb_user_id, fb_access_token, fb_account_id, fb_page_id, fb_page_name')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

    if (error) {
        logger.warn(`❌ getFacebookAccount error for user ${userId}: ${error.message} (code: ${error.code})`);
    }

    if (!data) {
        logger.warn(`❌ getFacebookAccount: No data found for user ${userId}`);
        return null;
    }

    logger.info(`✅ getFacebookAccount: Found account for user ${userId}, page=${data.fb_page_name}, page_id=${data.fb_page_id}`);
    return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMOTED OBJECT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Construit le promoted_object selon le type de destination
 */
function buildPromotedObject(data, fb) {
    const destType = data.destination_type || 'WEBSITE';

    switch (destType) {
        case 'MESSENGER':
        case 'INSTAGRAM_PROFILE':
        case 'WHATSAPP':
            return { page_id: fb.fb_page_id };
        case 'WEBSITE':
        default:
            // Pour WEBSITE, pas de promoted_object requis (pixel_id optionnel)
            return undefined;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRÉATION COMPLÈTE DE CAMPAGNE (3 niveaux)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compatibilité : convertit les anciens objectifs (frontend) vers les nouveaux (API v21)
 */
const OBJECTIVE_COMPAT_MAP = {
    'LINK_CLICKS': 'OUTCOME_TRAFFIC',
    'PAGE_LIKES': 'OUTCOME_AWARENESS',
    'POST_ENGAGEMENT': 'OUTCOME_ENGAGEMENT',
    'REACH': 'OUTCOME_AWARENESS',
    'BRAND_AWARENESS': 'OUTCOME_AWARENESS',
    'LEAD_GENERATION': 'OUTCOME_LEADS',
    'CONVERSIONS': 'OUTCOME_SALES',
    'APP_INSTALLS': 'OUTCOME_APP_PROMOTION',
    'VIDEO_VIEWS': 'OUTCOME_ENGAGEMENT',
    'MESSAGES': 'OUTCOME_ENGAGEMENT'
};

function normalizeObjective(objective) {
    const normalized = OBJECTIVE_COMPAT_MAP[objective] || objective;
    if (normalized !== objective) {
        logger.info(`🔄 Objectif normalisé: ${objective} → ${normalized}`);
    }
    return normalized;
}

/**
 * Crée une campagne complète sur Facebook :
 * 1. Campaign (objectif)
 * 2. Ad Set (audience + budget)
 * 3. Ad Creative + Ad
 * 
 * @param {string} userId - ID utilisateur AdsFacile
 * @param {Object} data - Données du wizard (campaign, adset, ad)
 * @returns {Object} { success, campaign_id, fb_campaign_id }
 */
async function createFullCampaign(userId, data) {
    // 0. Normaliser l'objectif (compatibilité ancienne API → v21)
    data.objective = normalizeObjective(data.objective);

    // 1. Récupérer credentials Facebook
    const fb = await getFacebookAccount(userId);
    if (!fb) {
        throw new Error('Compte Facebook non connecté. Connectez votre compte dans les paramètres.');
    }

    const accessToken = decryptToken(fb.fb_access_token);
    const adAccountId = fb.fb_account_id.startsWith('act_')
        ? fb.fb_account_id
        : `act_${fb.fb_account_id}`;

    logger.info(`📢 Création campagne FB pour user ${userId}, account ${adAccountId}`);

    try {
        // 2. Créer la Campaign
        logger.info('📢 Étape 1/4 : Création Campaign...');

        // Paramètres MINIMAUX pour test
        const campaignParams = {
            name: data.campaign_name || "Test Campaign AdsFacile",
            objective: data.objective || "OUTCOME_TRAFFIC", // Le plus simple
            status: "PAUSED", // Ne pas lancer tout de suite
            special_ad_categories: [], // Obligatoire même vide
            is_adset_budget_sharing_enabled: false // Requis dans l'API v21
        };

        logger.info('📦 Paramètres campagne:\n' + JSON.stringify(campaignParams, null, 2));

        const campaignResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/campaigns`,
            campaignParams,
            { params: { access_token: accessToken } }
        );
        const fbCampaignId = campaignResponse.data.id;
        logger.info(`✅ Campaign créée : ${fbCampaignId}`);

        // 3. Créer l'Ad Set
        logger.info('📢 Étape 2/4 : Création Ad Set...');

        // VALIDATE required fields
        if (!data.daily_budget || data.daily_budget < 1000) {
            throw new Error('Budget minimum : 1000 FCFA/jour');
        }

        if (!data.targeting || !data.targeting.locations || data.targeting.locations.length === 0) {
            throw new Error('Au moins une localisation est requise');
        }

        const dailyBudgetInCents = Math.round(data.daily_budget * 100);

        // Verify it's a valid number
        if (isNaN(dailyBudgetInCents) || dailyBudgetInCents < 100000) {
            throw new Error(`Budget invalide: ${data.daily_budget}. Minimum 1000 FCFA.`);
        }

        logger.info(`💰 Budget validé: ${data.daily_budget} FCFA = ${dailyBudgetInCents} centimes`);

        const adSetPayload = {
            name: data.adset_name || `${data.campaign_name} - AdSet`,
            campaign_id: fbCampaignId,
            daily_budget: dailyBudgetInCents,
            billing_event: 'IMPRESSIONS',
            optimization_goal: data.optimization_goal || getOptimizationGoal(data.objective),
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            targeting: buildTargeting(data.targeting),
            targeting_automation: {
                advantage_audience: 0
            },
            destination_type: data.destination_type || 'WEBSITE',
            status: 'PAUSED',
            start_time: data.start_date ? new Date(data.start_date).toISOString() : new Date().toISOString(),
            // DSA (Digital Services Act) — required by Facebook for all ad sets
            dsa_beneficiary: fb.fb_page_name || data.campaign_name || 'Advertiser',
            dsa_payor: fb.fb_page_name || data.campaign_name || 'Advertiser'
        };

        // Ajouter promoted_object seulement si nécessaire (Messenger, WhatsApp, Instagram)
        const promotedObject = buildPromotedObject(data, fb);
        if (promotedObject) {
            adSetPayload.promoted_object = promotedObject;
        }

        // Objectif de coût par résultat (optionnel) — bascule en stratégie "coût maîtrisé"
        if (data.cost_per_result_goal && Number(data.cost_per_result_goal) > 0) {
            adSetPayload.bid_strategy = 'COST_CAP';
            adSetPayload.bid_amount = Math.round(Number(data.cost_per_result_goal) * 100);
        }


        if (data.budget_type === 'lifetime' && data.end_date) {
            delete adSetPayload.daily_budget;
            const lifetimeBudgetInCents = Math.round((data.lifetime_budget || data.daily_budget) * 100);

            if (isNaN(lifetimeBudgetInCents) || lifetimeBudgetInCents < 100000) {
                throw new Error('Budget lifetime minimum : 1000 FCFA');
            }

            adSetPayload.lifetime_budget = lifetimeBudgetInCents;
        }

        if (data.end_date) {
            adSetPayload.end_time = new Date(data.end_date).toISOString();
        }

        // Log complete Ad Set payload BEFORE sending
        logger.info('📦 Paramètres Ad Set:\n' + JSON.stringify(adSetPayload, null, 2));

        const adSetResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/adsets`,
            adSetPayload,
            { params: { access_token: accessToken } }
        );
        const fbAdSetId = adSetResponse.data.id;
        logger.info(`✅ Ad Set créé : ${fbAdSetId}`);

        // 4. Upload image et créer Ad Creative
        logger.info('📢 Étape 3/4 : Création Ad Creative...');

        let imageHash = null;
        if (data.creative.media_type === 'image' && data.creative.media_url) {
            // Upload l'image depuis l'URL (Supabase Storage)
            try {
                const imageResponse = await axios.post(
                    `${FACEBOOK_GRAPH_URL}/${adAccountId}/adimages`,
                    { url: data.creative.media_url },
                    { params: { access_token: accessToken } }
                );
                const images = imageResponse.data.images;
                if (images) {
                    const firstKey = Object.keys(images)[0];
                    imageHash = images[firstKey]?.hash;
                }
                logger.info(`✅ Image uploadée, hash : ${imageHash}`);
            } catch (imgErr) {
                logger.warn('⚠️ Erreur upload image, continuation sans image:', imgErr.response?.data || imgErr.message);
            }
        }

        // Object story spec pour le creative
        const objectStorySpec = {
            page_id: fb.fb_page_id,
            link_data: {
                message: data.creative.message || '',
                link: data.creative.link || 'https://example.com',
                name: data.creative.headline || '',
                description: data.creative.description || '',
                call_to_action: {
                    type: data.creative.call_to_action || 'LEARN_MORE',
                    value: { link: data.creative.link || 'https://example.com' }
                }
            }
        };

        if (imageHash) {
            objectStorySpec.link_data.image_hash = imageHash;
        } else if (data.creative.media_url) {
            objectStorySpec.link_data.picture = data.creative.media_url;
        }

        const creativeResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/adcreatives`,
            {
                name: data.ad_name || `${data.campaign_name} - Creative`,
                object_story_spec: objectStorySpec
            },
            { params: { access_token: accessToken } }
        );
        const fbCreativeId = creativeResponse.data.id;
        logger.info(`✅ Ad Creative créé : ${fbCreativeId}`);

        // 5. Créer l'Ad
        logger.info('📢 Étape 4/4 : Création Ad...');
        const adResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/ads`,
            {
                name: data.ad_name || `${data.campaign_name} - Ad`,
                adset_id: fbAdSetId,
                creative: { creative_id: fbCreativeId },
                status: 'PAUSED'
            },
            { params: { access_token: accessToken } }
        );
        const fbAdId = adResponse.data.id;
        logger.info(`✅ Ad créée : ${fbAdId}`);

        // 6. Sauvegarder en base locale
        const { data: campaignRecord, error: dbError } = await supabase
            .from('campaigns')
            .insert({
                user_id: userId,
                fb_campaign_id: fbCampaignId,
                fb_adset_id: fbAdSetId,
                fb_ad_id: fbAdId,
                fb_creative_id: fbCreativeId,
                name: data.campaign_name,
                objective: data.objective,
                status: 'paused',
                daily_budget: data.daily_budget,
                targeting: data.targeting,
                creative: data.creative,
                start_date: data.start_date,
                end_date: data.end_date || null
            })
            .select()
            .single();

        if (dbError) {
            logger.error('❌ Erreur sauvegarde DB (campagne créée sur FB):', dbError);
            // La campagne existe sur FB même si la DB échoue
            return {
                success: true,
                campaign_id: null,
                fb_campaign_id: fbCampaignId,
                warning: 'Campagne créée sur Facebook mais erreur base locale'
            };
        }

        // 7. Logger dans audit_logs
        await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'campaign_created',
            details: {
                campaign_id: campaignRecord.id,
                fb_campaign_id: fbCampaignId,
                objective: data.objective,
                budget: data.daily_budget
            }
        }).then(() => { }).catch(err => {
            logger.warn('⚠️ Erreur audit log:', err.message);
        });

        logger.info(`🎉 Campagne complète créée avec succès ! ID: ${campaignRecord.id}`);

        return {
            success: true,
            campaign_id: campaignRecord.id,
            fb_campaign_id: fbCampaignId
        };

    } catch (error) {
        // Log the FULL error object
        if (error.response?.data) {
            logger.error('❌ Facebook API Full Error Response:');
            logger.error(JSON.stringify(error.response.data, null, 2));
        } else {
            logger.error('❌ Error without response:', error.message);
        }

        let stepContext = '';
        if (typeof fbCampaignId !== 'undefined' && typeof fbAdSetId === 'undefined') {
            stepContext = ' (Campaign créée, échec Ad Set)';
        } else if (typeof fbAdSetId !== 'undefined' && typeof fbCreativeId === 'undefined') {
            stepContext = ' (Campaign+AdSet créés, échec Creative)';
        } else if (typeof fbCreativeId !== 'undefined' && typeof fbAdId === 'undefined') {
            stepContext = ' (Campaign+AdSet+Creative créés, échec Ad)';
        }

        logger.error(`❌ Erreur création campagne Facebook${stepContext}:`, error.response?.data || error.message);

        // Remonter l'erreur Facebook avec plus de détails
        if (error.response?.data?.error) {
            const fbError = error.response.data.error;

            // Log all error details
            logger.error('Facebook Error Details:');
            logger.error(`- Message: ${fbError.message}`);
            logger.error(`- Code: ${fbError.code}`);
            logger.error(`- Subcode: ${fbError.error_subcode}`);
            logger.error(`- User Title: ${fbError.error_user_title}`);
            logger.error(`- User Message: ${fbError.error_user_msg}`);
            logger.error(`- Trace ID: ${fbError.fbtrace_id}`);

            const err = new Error(fbError.message || 'Erreur Facebook API');
            err.response = { error: fbError };
            err.fbErrorCode = fbError.code;
            err.fbErrorSubcode = fbError.error_subcode;
            throw err;
        }

        throw error;
    }
}

module.exports = {
    createFullCampaign,
    getFacebookAccount,
    buildTargeting,
    getOptimizationGoal
};
