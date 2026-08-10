/**
 * Facebook Ads Service — Marketing API Integration
 * AdsFacile Backend
 * 
 * Crée le flow complet : Campaign → Ad Set → Ad
 * via la Facebook Marketing API
 */

const axios = require('axios');
const FormData = require('form-data');
const { supabase } = require('../config/supabase');
const { decryptToken } = require('./facebookService');
const {
    isMessagingDestination,
    validateMessagingApps,
    buildMessagingDestination,
    normalizeWhatsAppNumber,
    buildMessageExtensions
} = require('./messagingDestinations');
const {
    fcfaToUsdCents,
    minDailyBudgetFcfa,
    getRate,
    FB_MIN_DAILY_BUDGET_CENTS,
    ACCOUNT_CURRENCY
} = require('../utils/currency');
const {
    validateCombination,
    getDefaultGoal,
    getBillingEvent
} = require('./campaignObjectives');
const { debutDeJournee, finDeJournee } = require('../utils/adAccountTime');
const logger = require('../utils/logger');

const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v21.0';

/** Fuseau retenu si Meta ne renvoie pas celui du compte. */
const FUSEAU_PAR_DEFAUT = 'America/Los_Angeles';

/**
 * Récupère le fuseau horaire du compte publicitaire.
 *
 * Meta interprète les dates de diffusion dans ce fuseau, jamais en UTC : sans
 * lui, une date de fin recule d'un jour pour tout compte à l'ouest de Greenwich.
 */
async function getAdAccountTimezone(adAccountId, accessToken) {
    try {
        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/${adAccountId}`, {
            params: { access_token: accessToken, fields: 'timezone_name' }
        });
        return response.data.timezone_name || FUSEAU_PAR_DEFAUT;
    } catch (err) {
        logger.warn('⚠️ Fuseau du compte publicitaire indisponible, repli sur '
            + `${FUSEAU_PAR_DEFAUT}: ${err.response?.data?.error?.message || err.message}`);
        return FUSEAU_PAR_DEFAUT;
    }
}

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
        age_max: targeting.age_max || 65,

        // Meta exige un choix explicite sur l'audience Advantage, et refuse la
        // création sans lui (sous-code 1870227). Le champ vit **dans** la
        // spécification de ciblage : le placer à côté, au niveau de l'ensemble
        // de publicités, revient à ne pas le fournir du tout.
        //
        // 0 par défaut : le ciblage composé par l'utilisateur est respecté tel
        // quel. À 1, Meta s'autorise à élargir l'audience au-delà de ce qui a
        // été demandé, ce qui ne doit pas arriver sans que l'utilisateur l'ait
        // choisi.
        targeting_automation: {
            advantage_audience: targeting.advantage_audience === 1 ? 1 : 0
        }
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

    // Fallback: if no locations, target Cameroon.
    // Doit couvrir TOUS les types gérés au-dessus : oublier geo_markets
    // ajouterait le Cameroun entier à un ciblage volontairement restreint.
    if (Object.keys(geoLocations).length === 0) {
        geoLocations.countries = ['CM'];
    }

    result.geo_locations = geoLocations;

    // ═══════════════════════════════════════════════════════════════════
    // GENRE
    // ═══════════════════════════════════════════════════════════════════
    // Le formulaire enregistre ['male'] / ['female'] / [] ; Meta attend
    // [1] / [2], et l'absence du champ pour « tous ». Faute de cette
    // conversion, le ciblage par genre était saisi puis perdu en silence :
    // la campagne visait tout le monde sans que rien ne le signale.
    const GENRES_META = { male: 1, female: 2 };
    if (Array.isArray(targeting.genders) && targeting.genders.length > 0) {
        const codes = targeting.genders
            .map(g => GENRES_META[String(g).toLowerCase()] || (g === 1 || g === 2 ? g : null))
            .filter(Boolean);

        // Cocher les deux revient à ne pas filtrer : Meta préfère le champ absent.
        if (codes.length === 1) result.genders = codes;
    }

    // ═══════════════════════════════════════════════════════════════════
    // INTÉRÊTS ET COMPORTEMENTS avec IDs de Facebook
    // ═══════════════════════════════════════════════════════════════════
    // Les deux vivent dans le même flexible_spec. Les comportements étaient
    // proposés par l'assistant IA mais n'atteignaient jamais Meta.
    const specs = {};

    if (targeting.interests && targeting.interests.length > 0) {
        specs.interests = targeting.interests
            .filter(i => i && i.id)
            .map(i => ({ id: i.id, name: i.name }));
    }

    if (targeting.behaviors && targeting.behaviors.length > 0) {
        // L'assistant IA peut renvoyer des libellés seuls, sans identifiant.
        // Meta exige un id : les entrées sans id sont écartées plutôt que de
        // faire échouer toute la campagne.
        const avecId = targeting.behaviors.filter(b => b && b.id);
        if (avecId.length > 0) {
            specs.behaviors = avecId.map(b => ({ id: b.id, name: b.name }));
        }
    }

    if (Object.keys(specs).length > 0) {
        result.flexible_spec = [specs];
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RÉCUPÉRATION DES CREDENTIALS FACEBOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère les credentials Facebook d'un utilisateur depuis la DB
 *
 * Les colonnes instagram_connected et whatsapp_connected font partie des
 * credentials : la validation des destinations de messagerie s'appuie dessus.
 * Les omettre les rendait `undefined`, ce que la validation lisait comme « non
 * relié » — le compte Instagram et le numéro WhatsApp étaient donc refusés
 * alors qu'ils étaient bien rattachés à la Page.
 */
async function getFacebookAccount(userId) {
    logger.info(`🔍 getFacebookAccount: Looking for facebook_accounts with user_id=${userId}, is_active=true`);

    const { data, error } = await supabase
        .from('facebook_accounts')
        .select('fb_user_id, fb_access_token, fb_account_id, fb_page_id, fb_page_name, '
            + 'instagram_connected, instagram_account_id, whatsapp_connected, whatsapp_number, '
            + 'whatsapp_phone_number_id')
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
function buildPromotedObject(destinationType, fb, whatsappNumber = null, whatsappNumberId = null) {
    if (isMessagingDestination(destinationType) || destinationType === 'INSTAGRAM_PROFILE') {
        const promoted = { page_id: fb.fb_page_id };

        // Une Page peut relier jusqu'à cinquante numéros WhatsApp : sans
        // désignation explicite, Meta n'en promeut aucun et le sélecteur de
        // numéro reste vide au niveau de la publicité.
        //
        // L'identifiant est préféré au numéro : Meta le rattache au compte
        // WhatsApp Business, et en déduit lui-même le numéro. Le numéro seul
        // est accepté mais reste une chaîne, sans lien vers le compte.
        //
        // Les deux ensemble sont refusés — « (#200) Permissions error » — donc
        // ce choix est exclusif.
        const id = String(whatsappNumberId || fb.whatsapp_phone_number_id || '').trim();
        const numero = normalizeWhatsAppNumber(whatsappNumber || fb.whatsapp_number);

        if (/^\d+$/.test(id)) {
            promoted.whats_app_business_phone_number_id = id;
        } else if (numero) {
            promoted.whatsapp_phone_number = numero;
        }

        return promoted;
    }
    // Pour WEBSITE, pas de promoted_object requis (pixel_id optionnel)
    return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RÉSOLUTION DE LA DESTINATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Détermine, à partir du wizard, le triplet destination / optimisation / bouton.
 *
 * Meta refuse toute publicité dont le bouton ne correspond pas à la destination
 * de son ensemble (erreur #1815675). Faire ce choix ici, en un seul endroit,
 * garantit que l'ensemble de publicités et la création ne peuvent pas diverger.
 *
 * @param {Object} data  données du wizard
 * @param {Object} fb    ligne facebook_accounts de l'utilisateur
 */
/**
 * Refuse une combinaison que Meta rejetterait, avant tout appel réseau.
 * L'erreur est marquée `userFacing` pour être affichée telle quelle.
 */
function assertCombinaisonValide({ objective, goal, destination, promoted_object }) {
    const verdict = validateCombination({ objective, goal, destination, promoted_object });
    if (verdict.valid) return;

    const err = new Error(verdict.errors.join(' '));
    err.userFacing = true;
    err.validationErrors = verdict.errors;
    throw err;
}

function resolveDestination(data, fb) {
    // Nouveau format : cases à cocher multiples.
    let apps = data.messaging_destinations;

    // Ancien format : un destination_type unique de messagerie.
    if (!apps && isMessagingDestination(data.destination_type)) {
        apps = [data.destination_type];
    }

    if (!apps || apps.length === 0) {
        const destinationType = data.destination_type || 'WEBSITE';

        // L'objectif de performance venu du formulaire n'était repris que sur
        // parole. Il survivait notamment à un changement d'objectif : passer de
        // Trafic à Notoriété conservait LANDING_PAGE_VIEWS, que Meta refuse
        // pour Notoriété — après avoir créé la campagne.
        const goal = data.optimization_goal
            || getDefaultGoal(data.objective, destinationType)
            || getOptimizationGoal(data.objective);

        assertCombinaisonValide({
            objective: data.objective,
            goal,
            destination: destinationType,
            promoted_object: buildPromotedObject(destinationType, fb) || {}
        });

        return {
            is_messaging: false,
            destination_type: destinationType,
            optimization_goal: goal
        };
    }

    // Vérifier le rattachement AVANT d'appeler Meta : un compte Instagram ou un
    // numéro WhatsApp non relié produit un rejet à la relecture, donc après
    // que la campagne a déjà été créée.
    const validation = validateMessagingApps(apps, fb, {
        whatsapp_phone_number: data.whatsapp_phone_number,
        whatsapp_phone_number_id: data.whatsapp_phone_number_id
    });
    if (!validation.valid) {
        const err = new Error(validation.errors.join(' '));
        err.userFacing = true;
        err.validationErrors = validation.errors;
        throw err;
    }

    return {
        is_messaging: true,
        whatsapp_phone_number: normalizeWhatsAppNumber(
            data.whatsapp_phone_number || fb.whatsapp_number
        ),
        whatsapp_phone_number_id: data.whatsapp_phone_number_id || fb.whatsapp_phone_number_id || null,
        ...buildMessagingDestination(apps)
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANNULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supprime chez Meta les objets déjà créés quand la suite échoue.
 *
 * Supprimer la campagne suffit en principe — Meta supprime l'arborescence — mais
 * on parcourt les niveaux du plus fin au plus large pour couvrir le cas où la
 * suppression de la campagne serait refusée.
 *
 * Une erreur d'annulation n'est jamais propagée : elle masquerait l'erreur
 * d'origine, seule utile à l'utilisateur.
 */
async function rollbackFacebookObjects(created, accessToken) {
    const targets = [
        ['publicité', created.ad],
        ['création', created.creative],
        ['ensemble de publicités', created.adset],
        ['campagne', created.campaign]
    ].filter(([, id]) => Boolean(id));

    for (const [label, id] of targets) {
        try {
            await axios.delete(`${FACEBOOK_GRAPH_URL}/${id}`, {
                params: { access_token: accessToken }
            });
            logger.info(`↩️ Annulation : ${label} ${id} supprimée`);
        } catch (err) {
            logger.warn(`⚠️ Annulation impossible pour ${label} ${id}: `
                + JSON.stringify(err.response?.data?.error || err.message));
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD DU VISUEL VERS META
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Envoie le visuel à Meta et renvoie son hash.
 *
 * Le visuel doit être transmis en multipart : passer une URL distante à
 * /adimages échoue avec « (#3) Application does not have the capability to make
 * this API call », l'envoi par URL étant une capacité réservée. On télécharge
 * donc l'image depuis Supabase Storage puis on envoie les octets.
 *
 * L'échec est bloquant : une publicité sans visuel est inéligible à la plupart
 * des placements, la laisser passer silencieusement produit une campagne qui ne
 * sera jamais diffusée.
 */
async function uploadAdImage(adAccountId, accessToken, mediaUrl) {
    if (!/^https?:\/\//i.test(mediaUrl)) {
        // Notamment les URL blob: laissées par un aperçu local du navigateur,
        // que Meta ne peut évidemment pas atteindre.
        const err = new Error('Le visuel n\'a pas été correctement téléversé. Ajoutez-le à nouveau.');
        err.userFacing = true;
        throw err;
    }

    const download = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
    });

    const form = new FormData();
    form.append('source', Buffer.from(download.data), {
        filename: mediaUrl.split('/').pop().split('?')[0] || 'creative',
        contentType: download.headers['content-type'] || 'image/jpeg'
    });

    const response = await axios.post(
        `${FACEBOOK_GRAPH_URL}/${adAccountId}/adimages`,
        form,
        {
            params: { access_token: accessToken },
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        }
    );

    const images = response.data.images || {};
    const firstKey = Object.keys(images)[0];
    const hash = firstKey && images[firstKey]?.hash;

    if (!hash) {
        throw new Error('Facebook n\'a pas renvoyé d\'identifiant pour le visuel.');
    }

    return hash;
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

    // Résoudre la destination avant tout appel réseau : si la combinaison est
    // invalide, mieux vaut le dire tout de suite que laisser des objets
    // orphelins chez Meta.
    const destination = resolveDestination(data, fb);
    logger.info(`🎯 Destination : ${destination.destination_type} `
        + `(optimisation ${destination.optimization_goal})`);

    const timezone = await getAdAccountTimezone(adAccountId, accessToken);
    logger.info(`🕐 Fuseau du compte publicitaire : ${timezone}`);

    // Identifiants des objets créés, pour pouvoir revenir en arrière.
    const created = { campaign: null, adset: null, creative: null, ad: null };

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
        created.campaign = fbCampaignId;
        logger.info(`✅ Campaign créée : ${fbCampaignId}`);

        // 3. Créer l'Ad Set
        logger.info('📢 Étape 2/4 : Création Ad Set...');

        if (!data.targeting || !data.targeting.locations || data.targeting.locations.length === 0) {
            throw new Error('Au moins une localisation est requise');
        }

        // L'utilisateur saisit des FCFA ; le compte publicitaire est en USD et
        // Meta attend des cents. Le minimum est celui de Meta (1 $/jour),
        // exprimé en FCFA pour rester compréhensible.
        const minFcfa = minDailyBudgetFcfa();
        const dailyBudgetInCents = fcfaToUsdCents(data.daily_budget);

        if (!Number.isFinite(dailyBudgetInCents) || dailyBudgetInCents < FB_MIN_DAILY_BUDGET_CENTS) {
            throw new Error(`Budget quotidien invalide : ${data.daily_budget} FCFA. Minimum ${minFcfa} FCFA/jour.`);
        }

        logger.info(`💰 Budget validé : ${data.daily_budget} FCFA = ${dailyBudgetInCents} cents ${ACCOUNT_CURRENCY} (taux ${getRate()} FCFA/USD)`);

        const adSetPayload = {
            name: data.adset_name || `${data.campaign_name} - AdSet`,
            campaign_id: fbCampaignId,
            daily_budget: dailyBudgetInCents,
            billing_event: getBillingEvent(destination.optimization_goal),
            optimization_goal: destination.optimization_goal,
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            targeting: buildTargeting(data.targeting),
            destination_type: destination.destination_type,
            status: 'PAUSED',
            start_time: debutDeJournee(data.start_date, timezone),
            // DSA (Digital Services Act) — required by Facebook for all ad sets
            dsa_beneficiary: fb.fb_page_name || data.campaign_name || 'Advertiser',
            dsa_payor: fb.fb_page_name || data.campaign_name || 'Advertiser'
        };

        // Ajouter promoted_object seulement si nécessaire (Messenger, WhatsApp, Instagram)
        const promotedObject = buildPromotedObject(
            destination.destination_type, fb,
            destination.whatsapp_phone_number, destination.whatsapp_phone_number_id
        );
        if (promotedObject) {
            adSetPayload.promoted_object = promotedObject;
        }

        // Objectif de coût par résultat (optionnel) — bascule en stratégie "coût maîtrisé"
        if (data.cost_per_result_goal && Number(data.cost_per_result_goal) > 0) {
            const bidAmount = fcfaToUsdCents(data.cost_per_result_goal);
            if (Number.isFinite(bidAmount) && bidAmount > 0) {
                adSetPayload.bid_strategy = 'COST_CAP';
                adSetPayload.bid_amount = bidAmount;
            }
        }

        if (data.budget_type === 'lifetime' && data.end_date) {
            delete adSetPayload.daily_budget;
            const lifetimeBudgetInCents = fcfaToUsdCents(data.lifetime_budget || data.daily_budget);

            if (!Number.isFinite(lifetimeBudgetInCents) || lifetimeBudgetInCents < FB_MIN_DAILY_BUDGET_CENTS) {
                throw new Error(`Budget total invalide. Minimum ${minFcfa} FCFA.`);
            }

            adSetPayload.lifetime_budget = lifetimeBudgetInCents;
        }

        if (data.end_date) {
            // Fin de la journée choisie dans le fuseau du compte : minuit UTC
            // ferait s'arrêter la campagne la veille au soir pour un compte
            // situé à l'ouest de Greenwich.
            adSetPayload.end_time = finDeJournee(data.end_date, timezone);
        }

        // Log complete Ad Set payload BEFORE sending
        logger.info('📦 Paramètres Ad Set:\n' + JSON.stringify(adSetPayload, null, 2));

        const adSetResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/adsets`,
            adSetPayload,
            { params: { access_token: accessToken } }
        );
        const fbAdSetId = adSetResponse.data.id;
        created.adset = fbAdSetId;
        logger.info(`✅ Ad Set créé : ${fbAdSetId}`);

        // 4. Upload image et créer Ad Creative
        logger.info('📢 Étape 3/4 : Création Ad Creative...');

        // La vidéo était téléversée par le formulaire puis ignorée ici : la
        // publicité partait sans aucun visuel, donc inéligible à la plupart des
        // placements. Refuser explicitement vaut mieux que diffuser une
        // publicité vide — la prise en charge viendra par /advideos.
        if (data.creative.media_type === 'video') {
            const err = new Error(
                'Les publicités vidéo ne sont pas encore prises en charge. '
                + 'Choisissez une image pour cette campagne.'
            );
            err.userFacing = true;
            throw err;
        }

        let imageHash = null;
        if (data.creative.media_type === 'image' && data.creative.media_url) {
            imageHash = await uploadAdImage(adAccountId, accessToken, data.creative.media_url);
            logger.info(`✅ Image uploadée, hash : ${imageHash}`);
        }

        // Le lien et le bouton viennent de la destination résolue : c'est ce qui
        // garantit qu'une création de messagerie ne se retrouve pas dans un
        // ensemble de publicités de messagerie avec un bouton de site web.
        const creativeLink = destination.is_messaging
            ? destination.link
            : (data.creative.link || data.website_url);

        const callToAction = destination.is_messaging
            ? destination.call_to_action
            : {
                type: data.creative.call_to_action || 'LEARN_MORE',
                value: { link: creativeLink }
            };

        const objectStorySpec = {
            page_id: fb.fb_page_id,
            link_data: {
                message: data.creative.message || '',
                link: creativeLink,
                name: data.creative.headline || '',
                description: data.creative.description || '',
                call_to_action: callToAction
            }
        };

        // Le lien d'affichage était saisi dans le formulaire, montré dans
        // l'aperçu, puis jamais transmis. Chez Meta, c'est `caption`.
        if (data.creative.display_link) {
            objectStorySpec.link_data.caption = data.creative.display_link;
        }

        // Message d'accueil de la conversation : la première chose que voit la
        // personne en ouvrant la discussion. Sans lui, Meta affiche un texte
        // générique.
        if (destination.is_messaging && data.creative.welcome_message) {
            objectStorySpec.link_data.page_welcome_message = data.creative.welcome_message;
        }

        if (imageHash) {
            objectStorySpec.link_data.image_hash = imageHash;
        }

        const creativePayload = {
            name: data.ad_name || `${data.campaign_name} - Creative`,
            object_story_spec: objectStorySpec,

            // Publicités multi-annonceurs : la publicité peut apparaître aux
            // côtés d'autres dans la même unité, et le visuel être recadré.
            // Depuis le 19 août 2024, Meta y inscrit d'office toute publicité
            // qui ne précise pas ce champ — nos utilisateurs y étaient donc
            // tous inscrits sans l'avoir choisi. Le champ est désormais
            // toujours transmis, avec la valeur décidée par l'utilisateur.
            contextual_multi_ads: {
                enroll_status: data.multi_advertiser_ads === false ? 'OPT_OUT' : 'OPT_IN'
            }
        };

        // Paramètres d'URL (UTM) : sans eux, impossible pour l'utilisateur de
        // savoir d'où vient son trafic.
        if (data.creative.url_tags) {
            creativePayload.url_tags = data.creative.url_tags;
        }

        // Exigé par Meta dès que la publicité vise plusieurs applications de
        // messagerie : sans lui, la création est refusée (sous-code 2446493).
        if (destination.asset_feed_spec) {
            creativePayload.asset_feed_spec = destination.asset_feed_spec;
        }

        // Bandeau de messagerie sur une publicité qui mène vers un site web :
        // la personne arrive bien sur le site, avec un bouton pour écrire à
        // l'entreprise. Meta impose alors que la création soit passée **en
        // ligne** dans POST /ads — la déclarer séparément échoue avec
        // « (#3) Application does not have the capability ».
        const extensions = destination.is_messaging
            ? null
            : buildMessageExtensions(data.website_message_apps);

        if (extensions) {
            creativePayload.asset_feed_spec = {
                ...(creativePayload.asset_feed_spec || {}),
                ...extensions
            };
        }

        let fbCreativeId = null;

        if (!extensions) {
            const creativeResponse = await axios.post(
                `${FACEBOOK_GRAPH_URL}/${adAccountId}/adcreatives`,
                creativePayload,
                { params: { access_token: accessToken } }
            );
            fbCreativeId = creativeResponse.data.id;
            created.creative = fbCreativeId;
            logger.info(`✅ Ad Creative créé : ${fbCreativeId}`);
        } else {
            logger.info('✅ Création passée en ligne (bandeau de messagerie)');
        }

        // 5. Créer l'Ad
        logger.info('📢 Étape 4/4 : Création Ad...');
        const adResponse = await axios.post(
            `${FACEBOOK_GRAPH_URL}/${adAccountId}/ads`,
            {
                name: data.ad_name || `${data.campaign_name} - Ad`,
                adset_id: fbAdSetId,
                creative: fbCreativeId ? { creative_id: fbCreativeId } : creativePayload,
                status: 'PAUSED'
            },
            { params: { access_token: accessToken } }
        );
        const fbAdId = adResponse.data.id;
        created.ad = fbAdId;
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
                destination_type: destination.destination_type,
                messaging_destinations: destination.apps || null,
                start_date: data.start_date,
                end_date: data.end_date || null
            })
            .select()
            .single();

        if (dbError) {
            // Ne pas annoncer un succès : sans ligne en base, la campagne est
            // invisible dans AdsFacile et impossible à mettre en pause ou à
            // supprimer, alors qu'elle existe bel et bien chez Meta. On revient
            // en arrière pour ne pas laisser d'objets orphelins.
            logger.error('❌ Erreur sauvegarde DB, annulation côté Facebook:', dbError);
            throw new Error(
                `Impossible d'enregistrer la campagne (${dbError.message}). Aucune campagne n'a été créée.`
            );
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
        if (created.campaign && !created.adset) {
            stepContext = ' (Campaign créée, échec Ad Set)';
        } else if (created.adset && !created.creative) {
            stepContext = ' (Campaign+AdSet créés, échec Creative)';
        } else if (created.creative && !created.ad) {
            stepContext = ' (Campaign+AdSet+Creative créés, échec Ad)';
        }

        logger.error(`❌ Erreur création campagne Facebook${stepContext}:`, error.response?.data || error.message);

        // Supprimer ce qui a déjà été créé chez Meta. Sans cela, chaque échec
        // laisse une campagne inaccessible depuis AdsFacile — c'est ainsi que
        // la campagne « ad1 » s'était retrouvée orpheline.
        await rollbackFacebookObjects(created, accessToken);

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

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGEMENT DE STATUT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Applique un statut chez Meta sur les trois niveaux de la campagne.
 *
 * Les trois doivent bouger ensemble. Activer la seule campagne ne diffuse rien,
 * parce que l'ensemble de publicités et la publicité restent en pause depuis
 * leur création : l'utilisateur voit « active » dans AdsFacile pendant que
 * Facebook n'affiche aucune diffusion.
 *
 * Ordre : du plus large au plus fin à l'activation, l'inverse à la mise en
 * pause, pour ne jamais laisser un niveau actif sous un parent en pause.
 *
 * @param {Object} campaign  ligne campaigns (fb_campaign_id, fb_adset_id, fb_ad_id)
 * @param {'active'|'paused'} status
 */
async function updateCampaignStatus(userId, campaign, status) {
    const fb = await getFacebookAccount(userId);
    if (!fb) {
        const err = new Error('Compte Facebook non connecté.');
        err.userFacing = true;
        throw err;
    }

    const accessToken = decryptToken(fb.fb_access_token);
    const fbStatus = status === 'active' ? 'ACTIVE' : 'PAUSED';

    const niveaux = [
        ['campagne', campaign.fb_campaign_id],
        ['ensemble de publicités', campaign.fb_adset_id],
        ['publicité', campaign.fb_ad_id]
    ].filter(([, id]) => Boolean(id));

    const ordonnes = fbStatus === 'ACTIVE' ? niveaux : [...niveaux].reverse();

    for (const [label, id] of ordonnes) {
        await axios.post(
            `${FACEBOOK_GRAPH_URL}/${id}`,
            { status: fbStatus },
            { params: { access_token: accessToken } }
        );
        logger.info(`🔁 ${label} ${id} → ${fbStatus}`);
    }

    return { status: fbStatus, levels: ordonnes.length };
}

/**
 * Supprime une campagne chez Meta.
 *
 * Supprimer la seule ligne locale ne suffit pas : la campagne disparaît du
 * tableau de bord mais continue d'exister chez Facebook — et de dépenser si
 * elle diffuse. L'utilisateur croit l'avoir arrêtée sans l'avoir fait.
 *
 * Supprimer la campagne emporte l'ensemble de publicités et la publicité :
 * Meta supprime l'arborescence.
 */
async function deleteCampaignOnFacebook(userId, campaign) {
    if (!campaign?.fb_campaign_id) return { deleted: false, reason: 'aucun identifiant Facebook' };

    const fb = await getFacebookAccount(userId);
    if (!fb) {
        const err = new Error('Compte Facebook non connecté.');
        err.userFacing = true;
        throw err;
    }

    const accessToken = decryptToken(fb.fb_access_token);

    await axios.delete(`${FACEBOOK_GRAPH_URL}/${campaign.fb_campaign_id}`, {
        params: { access_token: accessToken }
    });

    logger.info(`🗑️ Campagne ${campaign.fb_campaign_id} supprimée chez Facebook`);
    return { deleted: true };
}

module.exports = {
    createFullCampaign,
    updateCampaignStatus,
    deleteCampaignOnFacebook,
    getAdAccountTimezone,
    getFacebookAccount,
    buildTargeting,
    getOptimizationGoal,
    resolveDestination,
    buildPromotedObject,
    uploadAdImage,
    rollbackFacebookObjects
};
