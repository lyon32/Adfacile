/**
 * Facebook Insights Service — Marketing API Insights
 * AdsFacile Backend
 *
 * Récupère les insights de performance des campagnes via l'API Facebook Graph
 * Utilise axios (cohérent avec facebookAdsService.js)
 */

const axios = require('axios');
const { supabase } = require('../config/supabase');
const { decryptToken } = require('./facebookService');
const logger = require('../utils/logger');
const { createTtlCache } = require('../utils/ttlCache');

// Version de l'API Graph : une seule source, config/facebook.js.
const { GRAPH_URL: FACEBOOK_GRAPH_URL } = require('../config/facebook');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère les credentials Facebook d'un utilisateur
 */
async function getFacebookAccount(userId) {
    const { data, error } = await supabase
        .from('facebook_accounts')
        .select('fb_user_id, fb_access_token, fb_account_id, fb_page_id')
        .eq('user_id', userId)
        // Une ligne par Page connectée : sans ce filtre, plusieurs Pages
        // faisaient échouer .single() et Analytics croyait Facebook déconnecté.
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        logger.warn(`Pas de compte Facebook pour user ${userId}`);
        return null;
    }
    return data;
}

/**
 * Formatte une date en YYYY-MM-DD
 */
function formatDate(date) {
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
}

function getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return formatDate(d);
}

function getTodayDate() {
    return formatDate(new Date());
}

/**
 * Parse le tableau d'actions Facebook en objet { action_type: value }
 */
function parseActions(actionsArray) {
    if (!actionsArray || !Array.isArray(actionsArray)) return {};
    const result = {};
    actionsArray.forEach(action => {
        result[action.action_type] = parseInt(action.value) || 0;
    });
    return result;
}

/**
 * Calcul du taux d'engagement
 */
function calculateEngagementRate(actions, impressions) {
    const imp = parseInt(impressions) || 1;
    const engagement = (actions.post_engagement || 0);
    return parseFloat(((engagement / imp) * 100).toFixed(2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère TOUS les insights d'une campagne Facebook
 *
 * @param {string} userId - ID utilisateur AdsFacile
 * @param {string} campaignId - ID campagne locale (DB)
 * @param {{ start: string, end: string }} dateRange
 * @returns {Object} { overview, timeseries, demographics, geography, placements, devices, hourly }
 */
async function fetchCampaignInsights(userId, campaignId, dateRange) {
    // 1. Récupérer credentials
    const fb = await getFacebookAccount(userId);
    if (!fb) throw new Error('Compte Facebook non connecté');

    const accessToken = decryptToken(fb.fb_access_token);

    // 2. Récupérer fb_campaign_id depuis la DB
    const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('fb_campaign_id, name, objective')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .single();

    if (error || !campaign) throw new Error('Campagne non trouvée');

    const fbCampaignId = campaign.fb_campaign_id;
    if (!fbCampaignId) throw new Error('Campagne non liée à Facebook');

    const timeRange = JSON.stringify({
        since: dateRange.start,
        until: dateRange.end
    });

    const baseFields = 'impressions,clicks,spend,reach,frequency,ctr,cpc,cpm,cpp,actions,conversions,cost_per_action_type,cost_per_conversion,post_engagement,page_engagement,video_views,purchase_roas,inline_link_clicks,outbound_clicks,unique_clicks,unique_ctr';

    logger.info(`📊 Fetching insights for campaign ${fbCampaignId} (${dateRange.start} → ${dateRange.end})`);

    // 3. Appels parallèles à l'API Facebook
    const [
        timeseriesRes,
        totalRes,
        demographicRes,
        geoRes,
        placementRes,
        deviceRes,
        hourlyRes
    ] = await Promise.allSettled([
        // Timeseries (jour par jour)
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: baseFields,
                time_range: timeRange,
                time_increment: 1,
                level: 'campaign'
            }
        }),

        // Total agrégé
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: baseFields,
                time_range: timeRange,
                level: 'campaign'
            }
        }),

        // Breakdown démographique (âge × genre)
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: 'impressions,clicks,spend,ctr,cpc,actions',
                time_range: timeRange,
                breakdowns: 'age,gender',
                level: 'campaign'
            }
        }),

        // Breakdown géographique
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: 'impressions,clicks,spend,ctr',
                time_range: timeRange,
                breakdowns: 'country,region',
                level: 'campaign'
            }
        }),

        // Breakdown placements
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: 'impressions,clicks,spend,ctr,cpc',
                time_range: timeRange,
                breakdowns: 'publisher_platform,platform_position',
                level: 'campaign'
            }
        }),

        // Breakdown appareils
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: 'impressions,clicks,spend,ctr',
                time_range: timeRange,
                breakdowns: 'device_platform',
                level: 'campaign'
            }
        }),

        // Breakdown horaire
        axios.get(`${FACEBOOK_GRAPH_URL}/${fbCampaignId}/insights`, {
            params: {
                access_token: accessToken,
                fields: 'impressions,clicks',
                time_range: timeRange,
                breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
                level: 'campaign'
            }
        })
    ]);

    // 4. Parser les résultats (avec fallback si erreur)
    const safeData = (res) => res.status === 'fulfilled' ? (res.value.data.data || []) : [];

    return {
        overview: parseOverviewMetrics(safeData(totalRes)[0] || {}),
        timeseries: parseTimeseriesData(safeData(timeseriesRes)),
        demographics: parseDemographicData(safeData(demographicRes)),
        geography: parseGeoData(safeData(geoRes)),
        placements: parsePlacementData(safeData(placementRes)),
        devices: parseDeviceData(safeData(deviceRes)),
        hourly: parseHourlyData(safeData(hourlyRes))
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseOverviewMetrics(insight) {
    if (!insight || !insight.impressions) {
        return {
            impressions: 0, clicks: 0, spend: 0, reach: 0, frequency: 0,
            ctr: 0, cpc: 0, cpm: 0, cpp: 0,
            conversions: 0, conversion_rate: 0, cpa: 0,
            post_engagement: 0, page_engagement: 0, link_clicks: 0,
            video_views: 0, roas: 0, engagement_rate: 0
        };
    }

    const actions = parseActions(insight.actions);

    return {
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        reach: parseInt(insight.reach) || 0,
        frequency: parseFloat(insight.frequency) || 0,
        ctr: parseFloat(insight.ctr) || 0,
        cpc: parseFloat(insight.cpc) || 0,
        cpm: parseFloat(insight.cpm) || 0,
        cpp: parseFloat(insight.cpp) || 0,

        conversions: actions.offsite_conversion || actions.lead || 0,
        conversion_rate: 0,
        cpa: parseFloat(
            (insight.cost_per_action_type || []).find(c => c.action_type === 'offsite_conversion')?.value
        ) || 0,

        post_engagement: actions.post_engagement || 0,
        page_engagement: actions.page_engagement || 0,
        link_clicks: actions.link_click || parseInt(insight.inline_link_clicks) || 0,
        video_views: actions.video_view || parseInt(insight.video_views) || 0,

        roas: parseFloat(
            Array.isArray(insight.purchase_roas) ? insight.purchase_roas[0]?.value : 0
        ) || 0,

        engagement_rate: calculateEngagementRate(actions, insight.impressions)
    };
}

function parseTimeseriesData(insights) {
    return insights.map(day => ({
        date: day.date_start,
        impressions: parseInt(day.impressions) || 0,
        clicks: parseInt(day.clicks) || 0,
        conversions: parseActions(day.actions).offsite_conversion || 0,
        spend: parseFloat(day.spend) || 0,
        ctr: parseFloat(day.ctr) || 0,
        cpc: parseFloat(day.cpc) || 0,
        reach: parseInt(day.reach) || 0
    }));
}

function parseDemographicData(insights) {
    const byAge = {};
    const byGender = {};

    insights.forEach(row => {
        const age = row.age;
        const gender = row.gender === 'male' ? 'Hommes' : row.gender === 'female' ? 'Femmes' : 'Non spécifié';
        const imp = parseInt(row.impressions) || 0;
        const clk = parseInt(row.clicks) || 0;
        const spd = parseFloat(row.spend) || 0;
        const conv = parseActions(row.actions).offsite_conversion || 0;

        // Par âge
        if (age) {
            if (!byAge[age]) byAge[age] = { age, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
            byAge[age].impressions += imp;
            byAge[age].clicks += clk;
            byAge[age].spend += spd;
            byAge[age].conversions += conv;
        }

        // Par genre
        if (!byGender[gender]) byGender[gender] = { gender, impressions: 0, clicks: 0, spend: 0 };
        byGender[gender].impressions += imp;
        byGender[gender].clicks += clk;
        byGender[gender].spend += spd;
    });

    // Calculer CTR et CPA
    Object.values(byAge).forEach(row => {
        row.ctr = row.impressions > 0 ? parseFloat(((row.clicks / row.impressions) * 100).toFixed(2)) : 0;
        row.cpa = row.conversions > 0 ? parseFloat((row.spend / row.conversions).toFixed(0)) : 0;
    });

    Object.values(byGender).forEach(row => {
        row.ctr = row.impressions > 0 ? parseFloat(((row.clicks / row.impressions) * 100).toFixed(2)) : 0;
    });

    return {
        byAge: Object.values(byAge),
        byGender: Object.values(byGender)
    };
}

function parseGeoData(insights) {
    return insights.map(row => ({
        country: row.country || '—',
        region: row.region || '—',
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        spend: parseFloat(row.spend) || 0,
        ctr: parseFloat(row.ctr) || 0
    })).sort((a, b) => b.impressions - a.impressions);
}

function parsePlacementData(insights) {
    return insights.map(row => ({
        platform: row.publisher_platform || '—',
        position: row.platform_position || '—',
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        spend: parseFloat(row.spend) || 0,
        ctr: parseFloat(row.ctr) || 0,
        cpc: parseFloat(row.cpc) || 0
    })).sort((a, b) => b.impressions - a.impressions);
}

function parseDeviceData(insights) {
    return insights.map(row => ({
        device: row.device_platform === 'mobile' ? 'Mobile' : row.device_platform === 'desktop' ? 'Desktop' : (row.device_platform || '—'),
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        spend: parseFloat(row.spend) || 0,
        ctr: parseFloat(row.ctr) || 0
    })).sort((a, b) => b.impressions - a.impressions);
}

function parseHourlyData(insights) {
    // Build array of 24 hours
    const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: `${String(i).padStart(2, '0')}:00`,
        impressions: 0,
        clicks: 0
    }));

    insights.forEach(row => {
        const h = parseInt(row.hourly_stats_aggregated_by_advertiser_time_zone);
        if (!isNaN(h) && h >= 0 && h < 24) {
            hours[h].impressions += parseInt(row.impressions) || 0;
            hours[h].clicks += parseInt(row.clicks) || 0;
        }
    });

    return hours;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOUTES LES CAMPAGNES (comparaison)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère les insights agrégés de toutes les campagnes d'un utilisateur
 */
async function fetchAllCampaignsInsights(userId, dateRange) {
    const fb = await getFacebookAccount(userId);
    if (!fb) throw new Error('Compte Facebook non connecté');

    const accessToken = decryptToken(fb.fb_access_token);

    // Récupérer toutes les campagnes de l'utilisateur
    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, fb_campaign_id, name, objective, status, daily_budget')
        .eq('user_id', userId);

    if (error || !campaigns) return [];

    const timeRange = JSON.stringify({
        since: dateRange.start,
        until: dateRange.end
    });

    const baseFields = 'impressions,clicks,spend,reach,ctr,cpc,cpm,actions,cost_per_action_type';

    // Fetch insights pour chaque campagne en parallèle (max 5 concurrent)
    const results = [];
    const batchSize = 5;

    for (let i = 0; i < campaigns.length; i += batchSize) {
        const batch = campaigns.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
            batch.map(async (camp) => {
                if (!camp.fb_campaign_id) return null;

                try {
                    const res = await axios.get(`${FACEBOOK_GRAPH_URL}/${camp.fb_campaign_id}/insights`, {
                        params: {
                            access_token: accessToken,
                            fields: baseFields,
                            time_range: timeRange,
                            level: 'campaign'
                        }
                    });

                    const data = res.data.data?.[0];
                    if (!data) return null;

                    const actions = parseActions(data.actions);
                    return {
                        id: camp.id,
                        name: camp.name,
                        objective: camp.objective,
                        status: camp.status,
                        daily_budget: camp.daily_budget,
                        impressions: parseInt(data.impressions) || 0,
                        clicks: parseInt(data.clicks) || 0,
                        spend: parseFloat(data.spend) || 0,
                        reach: parseInt(data.reach) || 0,
                        ctr: parseFloat(data.ctr) || 0,
                        cpc: parseFloat(data.cpc) || 0,
                        cpm: parseFloat(data.cpm) || 0,
                        conversions: actions.offsite_conversion || actions.lead || 0,
                        cpa: parseFloat(
                            (data.cost_per_action_type || []).find(c => c.action_type === 'offsite_conversion')?.value
                        ) || 0
                    };
                } catch (err) {
                    logger.warn(`⚠️ Insights error for campaign ${camp.id}: ${err.message}`);
                    return null;
                }
            })
        );

        batchResults.forEach(r => {
            if (r.status === 'fulfilled' && r.value) results.push(r.value);
        });
    }

    return results;
}

/**
 * Agrège les données de toutes les campagnes en un seul overview
 */
function aggregateCampaignsData(campaignsList) {
    const totals = {
        impressions: 0, clicks: 0, spend: 0, reach: 0,
        conversions: 0, post_engagement: 0
    };

    campaignsList.forEach(c => {
        totals.impressions += c.impressions || 0;
        totals.clicks += c.clicks || 0;
        totals.spend += c.spend || 0;
        totals.reach += c.reach || 0;
        totals.conversions += c.conversions || 0;
    });

    totals.ctr = totals.impressions > 0 ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0;
    totals.cpc = totals.clicks > 0 ? parseFloat((totals.spend / totals.clicks).toFixed(2)) : 0;
    totals.cpm = totals.impressions > 0 ? parseFloat(((totals.spend / totals.impressions) * 1000).toFixed(2)) : 0;
    totals.cpa = totals.conversions > 0 ? parseFloat((totals.spend / totals.conversions).toFixed(0)) : 0;
    totals.frequency = 0;
    totals.cpp = 0;
    totals.page_engagement = 0;
    totals.link_clicks = 0;
    totals.video_views = 0;
    totals.roas = 0;
    totals.conversion_rate = 0;
    totals.engagement_rate = totals.impressions > 0 ? parseFloat(((totals.post_engagement / totals.impressions) * 100).toFixed(2)) : 0;

    return { overview: totals, timeseries: [], demographics: { byAge: [], byGender: [] }, geography: [], placements: [], devices: [], hourly: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════════

// Plafond de l'app : 240 appels Graph/heure (relevé MCP Meta, 8 oct. 2026).
// Une ouverture de la page Analytics en coûtait jusqu'à 7 par campagne.
const cacheInsights = createTtlCache({ maxEntries: 500 });

const DIX_MINUTES = 10 * 60 * 1000;
const SIX_HEURES = 6 * 60 * 60 * 1000;

/**
 * Durée de validité des statistiques d'une période.
 * Meta les met à jour environ toutes les 15 minutes : 10 minutes si la période
 * inclut aujourd'hui, 6 heures pour une période close, qui ne bouge plus.
 */
function insightsTtl(dateRange, today = getTodayDate()) {
    return dateRange.end >= today ? DIX_MINUTES : SIX_HEURES;
}

function getCampaignInsights(userId, campaignId, dateRange) {
    return cacheInsights.remember(
        `campagne:${userId}:${campaignId}:${dateRange.start}:${dateRange.end}`,
        insightsTtl(dateRange),
        () => fetchCampaignInsights(userId, campaignId, dateRange)
    );
}

function getAllCampaignsInsights(userId, dateRange) {
    return cacheInsights.remember(
        `toutes:${userId}:${dateRange.start}:${dateRange.end}`,
        insightsTtl(dateRange),
        () => fetchAllCampaignsInsights(userId, dateRange)
    );
}

module.exports = {
    insightsTtl,
    getCampaignInsights,
    getAllCampaignsInsights,
    aggregateCampaignsData,
    getDateDaysAgo,
    getTodayDate
};
