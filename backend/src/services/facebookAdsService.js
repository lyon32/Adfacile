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

const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v19.0';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map des clés Facebook pour les villes camerounaises
 */
const CITY_KEYS = {
    'Douala': '111787',
    'Yaoundé': '111793',
    'Bafoussam': '111748',
    'Garoua': '111768',
    'Bamenda': '111750',
    'Maroua': '111780',
    'Ngaoundéré': '111784',
    'Edéa': '111764',
    'Kribi': '111776'
};

function getCityKey(city) {
    return CITY_KEYS[city] || null;
}

/**
 * Mappe l'objectif campagne vers l'optimization goal Facebook
 */
function getOptimizationGoal(objective) {
    const goals = {
        'LINK_CLICKS': 'LINK_CLICKS',
        'OUTCOME_ENGAGEMENT': 'ENGAGEMENT',
        'OUTCOME_LEADS': 'LEAD_GENERATION',
        'OUTCOME_SALES': 'OFFSITE_CONVERSIONS',
        'OUTCOME_AWARENESS': 'REACH',
        'APP_INSTALLS': 'APP_INSTALLS'
    };
    return goals[objective] || 'REACH';
}

/**
 * Construit l'objet targeting Facebook à partir des données app
 */
function buildTargeting(targeting) {
    const result = {
        age_min: targeting.age_min || 18,
        age_max: targeting.age_max || 65
    };

    // Géo-localisation
    const geoLocations = {};

    if (targeting.locations && targeting.locations.includes('Cameroun')) {
        geoLocations.countries = ['CM'];
    }

    const cities = (targeting.locations || [])
        .filter(l => l !== 'Cameroun')
        .map(city => {
            const key = getCityKey(city);
            return key ? { key, name: city, radius: 25, distance_unit: 'kilometer' } : null;
        })
        .filter(Boolean);

    if (cities.length > 0) {
        geoLocations.cities = cities;
    }

    // Fallback : si aucune localisation, cibler le Cameroun
    if (!geoLocations.countries && !geoLocations.cities) {
        geoLocations.countries = ['CM'];
    }

    result.geo_locations = geoLocations;

    // Genre
    if (targeting.genders && targeting.genders.length > 0) {
        result.genders = targeting.genders.map(g => g === 'male' ? 1 : 2);
    }

    // Intérêts et comportements
    if (targeting.interests && targeting.interests.length > 0) {
        result.flexible_spec = [
            { interests: targeting.interests.map(i => ({ name: i })) }
        ];
    }

    if (targeting.behaviors && targeting.behaviors.length > 0) {
        if (!result.flexible_spec) result.flexible_spec = [{}];
        result.flexible_spec[0].behaviors = targeting.behaviors.map(b => ({ name: b }));
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
    const { data, error } = await supabase
        .from('facebook_accounts')
        .select('fb_user_id, fb_access_token, fb_account_id, fb_page_id, fb_page_name, fb_page_token')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        logger.warn(`Pas de compte Facebook pour user ${userId}`);
        return null;
    }

    return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRÉATION COMPLÈTE DE CAMPAGNE (3 niveaux)
// ═══════════════════════════════════════════════════════════════════════════════

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
    // 1. Récupérer credentials Facebook
    const fb = await getFacebookAccount(userId);
    if (!fb) {
        throw new Error('Compte Facebook non connecté. Connectez votre compte dans les paramètres.');
    }

    const accessToken = decryptToken(fb.fb_access_token);
    const adAccountId = `act_${fb.fb_account_id}`;

    logger.info(`📢 Création campagne FB pour user ${userId}, account ${adAccountId}`);

    try {
        // 2. Créer la Campaign
        logger.info('📢 Étape 1/4 : Création Campaign...');
        const campaignResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/campaigns`,
            {
                name: data.campaign_name,
                objective: data.objective,
                status: 'PAUSED',
                special_ad_categories: []
            },
            { params: { access_token: accessToken } }
        );
        const fbCampaignId = campaignResponse.data.id;
        logger.info(`✅ Campaign créée : ${fbCampaignId}`);

        // 3. Créer l'Ad Set
        logger.info('📢 Étape 2/4 : Création Ad Set...');
        const adSetPayload = {
            name: data.adset_name || `${data.campaign_name} - AdSet`,
            campaign_id: fbCampaignId,
            daily_budget: Math.round(data.daily_budget * 100), // centimes
            billing_event: 'IMPRESSIONS',
            optimization_goal: getOptimizationGoal(data.objective),
            targeting: buildTargeting(data.targeting),
            status: 'PAUSED',
            start_time: data.start_date ? new Date(data.start_date).toISOString() : new Date().toISOString()
        };

        if (data.budget_type === 'lifetime' && data.end_date) {
            delete adSetPayload.daily_budget;
            adSetPayload.lifetime_budget = Math.round(data.daily_budget * 100);
        }

        if (data.end_date) {
            adSetPayload.end_time = new Date(data.end_date).toISOString();
        }

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
        logger.error('❌ Erreur création campagne Facebook:', error.response?.data || error.message);

        // Remonter l'erreur Facebook avec plus de détails
        if (error.response?.data?.error) {
            const fbError = error.response.data.error;
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
