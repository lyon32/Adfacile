/**
 * Service IA — Génération de textes publicitaires & ciblage
 * AdsFacile Backend
 * 
 * Stratégie hybride :
 * - ACTUELLEMENT : Gemini 1.5 Flash pour TOUS les plans (gratuit Google AI Studio)
 * - FUTUR : Claude Haiku 3.5 pour plans PRO/Agency (meilleure qualité français)
 * 
 * Pour activer Claude plus tard, mettez USE_CLAUDE_FOR_PRO=true dans .env
 * et renseignez ANTHROPIC_API_KEY
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DES PROVIDERS IA
// ═══════════════════════════════════════════════════════════════════════════════

// Gemini (Google) — Actif pour tous les plans
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// Claude (Anthropic) — Préparé pour le futur
// const Anthropic = require('@anthropic-ai/sdk');
// const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const USE_CLAUDE_FOR_PRO = process.env.USE_CLAUDE_FOR_PRO === 'true';

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_LIMITS = {
    free: { ai_credits: 3, unlimited: false },
    starter: { ai_credits: 20, unlimited: false },
    pro: { ai_credits: 99999, unlimited: true },
    agency: { ai_credits: 99999, unlimited: true }
};

// ═══════════════════════════════════════════════════════════════════════════════
// APPELS IA — PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Appel API Gemini 1.5 Flash
 * @param {string} prompt - Le prompt à envoyer
 * @returns {string} Réponse texte brute
 */
async function _callGemini(prompt) {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY non configurée. Ajoutez-la dans votre fichier .env');
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
}

/**
 * Appel API Claude Haiku (FUTUR — non actif)
 * Décommentez et installez @anthropic-ai/sdk quand prêt
 * @param {string} prompt - Le prompt à envoyer
 * @returns {string} Réponse texte brute
 */
async function _callClaude(prompt) {
    // TODO: Activer quand l'API Anthropic sera disponible
    // const msg = await claude.messages.create({
    //   model: CLAUDE_MODEL,
    //   max_tokens: 1024,
    //   messages: [{ role: 'user', content: prompt }]
    // });
    // return msg.content[0].text;

    throw new Error(
        'Claude API non encore activée. Utilisez Gemini ou configurez USE_CLAUDE_FOR_PRO=false'
    );
}

/**
 * Choisit et appelle le bon provider IA selon le plan
 * @param {string} userPlan - Plan de l'utilisateur
 * @param {string} prompt - Le prompt à envoyer
 * @returns {string} Réponse texte brute
 */
async function _callAI(userPlan, prompt) {
    // Futur : utiliser Claude pour PRO/Agency
    if (USE_CLAUDE_FOR_PRO && (userPlan === 'pro' || userPlan === 'agency')) {
        logger.info(`🤖 Appel Claude (${CLAUDE_MODEL}) pour plan ${userPlan}`);
        return _callClaude(prompt);
    }

    // Par défaut : Gemini pour tous
    logger.info(`🤖 Appel Gemini (${GEMINI_MODEL}) pour plan ${userPlan}`);
    return _callGemini(prompt);
}

/**
 * Parse la réponse JSON de l'IA (gère le markdown wrapping)
 * @param {string} rawText - Texte brut de la réponse IA
 * @returns {Object|Array} JSON parsé
 */
function _parseAIResponse(rawText) {
    // Nettoyer le markdown wrapping (```json ... ```)
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    try {
        return JSON.parse(cleaned);
    } catch (err) {
        logger.error('❌ Erreur parsing réponse IA:', err.message);
        logger.error('Réponse brute:', rawText.substring(0, 500));
        throw new Error('Réponse IA invalide. Veuillez réessayer.');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION CRÉDITS IA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie que l'utilisateur a des crédits IA restants
 * @param {string} userId - ID de l'utilisateur
 * @returns {{ canUse: boolean, credits: number, plan: string }}
 */
async function _checkCredits(userId) {
    const { data: user, error } = await supabase
        .from('users')
        .select('plan, ai_credits')
        .eq('id', userId)
        .single();

    if (error || !user) {
        throw new Error('Utilisateur non trouvé');
    }

    const planConfig = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    // Plans illimités (PRO/Agency) → toujours OK
    if (planConfig.unlimited) {
        return { canUse: true, credits: user.ai_credits, plan: user.plan };
    }

    // Plans limités (Free/Starter) → vérifier crédits
    if (user.ai_credits <= 0) {
        return { canUse: false, credits: 0, plan: user.plan };
    }

    return { canUse: true, credits: user.ai_credits, plan: user.plan };
}

/**
 * Décrémente les crédits IA de l'utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {string} plan - Plan actuel
 */
async function _decrementCredits(userId, plan) {
    const planConfig = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Ne pas décrémenter pour les plans illimités
    if (planConfig.unlimited) return;

    const { error } = await supabase.rpc('decrement_ai_credits', { user_id_param: userId });

    // Fallback si la fonction RPC n'existe pas
    if (error) {
        logger.warn('⚠️ RPC decrement_ai_credits non trouvée, utilisation UPDATE directe');
        await supabase
            .from('users')
            .update({ ai_credits: supabase.raw('ai_credits - 1') })
            .eq('id', userId);

        // Si raw() ne fonctionne pas, on fait un select + update
        const { data: user } = await supabase
            .from('users')
            .select('ai_credits')
            .eq('id', userId)
            .single();

        if (user) {
            await supabase
                .from('users')
                .update({ ai_credits: Math.max(0, user.ai_credits - 1) })
                .eq('id', userId);
        }
    }
}

/**
 * Log la génération IA dans la table ai_generations
 */
async function _logGeneration(userId, type, input, output, modelUsed) {
    try {
        await supabase.from('ai_generations').insert({
            user_id: userId,
            type,
            input,
            output,
            model_used: modelUsed,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        // Ne pas bloquer si le logging échoue (table peut ne pas exister encore)
        logger.warn('⚠️ Impossible de logger la génération IA:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FONCTIONS PUBLIQUES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Génère 3 variations de texte publicitaire Facebook
 */
async function generateAdText({ userId, product, niche, audience, tone, city }) {
    // 1. Vérifier crédits
    const creditCheck = await _checkCredits(userId);
    if (!creditCheck.canUse) {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return {
            success: false,
            error: 'credits_exhausted',
            message: 'Vos crédits IA gratuits sont épuisés ce mois.',
            credits_remaining: 0,
            credits_reset: nextMonth.toISOString().split('T')[0],
            upgrade_url: '/pricing'
        };
    }

    // 2. Construire le prompt
    const prompt = `Tu es expert en publicités Facebook pour PME africaines.
Génère 3 textes publicitaires pour :
- Produit/Service : ${product}
- Secteur : ${niche}
- Ville cible : ${city || 'Douala'}
- Audience cible : ${audience}
- Ton souhaité : ${tone || 'friendly'}

Retourne EXACTEMENT ce JSON (pas de texte autour, juste le JSON) :
[{
  "variation": 1,
  "ad_text": "texte principal max 150 mots",
  "headline": "titre accrocheur max 40 chars",
  "description": "sous-titre max 25 mots",
  "cta": "En savoir plus|Acheter maintenant|Nous contacter|S'inscrire",
  "emoji_used": ["🎯","✅"],
  "target_keywords": ["mot1","mot2"]
}]

IMPORTANT : Adapte le langage au marché camerounais/africain.
Utilise des expressions locales si le ton est 'local'.
Le JSON doit contenir exactement 3 objets.`;

    // 3. Appeler l'IA
    const modelUsed = (USE_CLAUDE_FOR_PRO && (creditCheck.plan === 'pro' || creditCheck.plan === 'agency'))
        ? CLAUDE_MODEL : GEMINI_MODEL;

    const rawResponse = await _callAI(creditCheck.plan, prompt);
    const variations = _parseAIResponse(rawResponse);

    // 4. Décrémenter crédits
    await _decrementCredits(userId, creditCheck.plan);

    // 5. Logger la génération
    await _logGeneration(userId, 'ad_text', { product, niche, audience, tone, city }, variations, modelUsed);

    // 6. Retourner le résultat
    return {
        success: true,
        variations,
        credits_remaining: creditCheck.credits - (PLAN_LIMITS[creditCheck.plan]?.unlimited ? 0 : 1),
        model_used: modelUsed
    };
}

/**
 * Génère 3 propositions de ciblage audience Facebook
 */
async function generateAudienceTargeting({ userId, niche, city, budget }) {
    // 1. Vérifier crédits
    const creditCheck = await _checkCredits(userId);
    if (!creditCheck.canUse) {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return {
            success: false,
            error: 'credits_exhausted',
            message: 'Vos crédits IA gratuits sont épuisés ce mois.',
            credits_remaining: 0,
            credits_reset: nextMonth.toISOString().split('T')[0],
            upgrade_url: '/pricing'
        };
    }

    // 2. Construire le prompt
    const prompt = `Tu es expert en ciblage publicitaire Facebook pour le marché africain.
Propose 3 stratégies de ciblage Facebook Ads pour :
- Secteur : ${niche}
- Ville : ${city || 'Douala'}
- Budget journalier : ${budget || 5000} FCFA

Retourne EXACTEMENT ce JSON (pas de texte autour, juste le JSON) :
[{
  "strategy_name": "nom court de la stratégie",
  "age_min": 25,
  "age_max": 45,
  "gender": "all|male|female",
  "interests": ["intérêt 1", "intérêt 2", "intérêt 3"],
  "behaviors": ["comportement 1"],
  "estimated_reach": "10,000 - 50,000",
  "recommended_budget": 5000,
  "why_this_works": "explication courte en français"
}]

IMPORTANT : Adapte les centres d'intérêt au marché camerounais/africain.
Le JSON doit contenir exactement 3 objets.`;

    // 3. Appeler l'IA
    const modelUsed = (USE_CLAUDE_FOR_PRO && (creditCheck.plan === 'pro' || creditCheck.plan === 'agency'))
        ? CLAUDE_MODEL : GEMINI_MODEL;

    const rawResponse = await _callAI(creditCheck.plan, prompt);
    const strategies = _parseAIResponse(rawResponse);

    // 4. Décrémenter crédits
    await _decrementCredits(userId, creditCheck.plan);

    // 5. Logger
    await _logGeneration(userId, 'targeting', { niche, city, budget }, strategies, modelUsed);

    return {
        success: true,
        strategies,
        credits_remaining: creditCheck.credits - (PLAN_LIMITS[creditCheck.plan]?.unlimited ? 0 : 1),
        model_used: modelUsed
    };
}

/**
 * Analyse avancée IA (PRO/Agency uniquement)
 */
async function analyzeContentForPro({ userId, text, analysisType }) {
    // 1. Vérifier que le user est PRO ou Agency
    const { data: user, error } = await supabase
        .from('users')
        .select('plan')
        .eq('id', userId)
        .single();

    if (error || !user) {
        throw new Error('Utilisateur non trouvé');
    }

    if (user.plan === 'free' || user.plan === 'starter') {
        return {
            success: false,
            error: 'upgrade_required',
            message: 'L\'analyse IA avancée nécessite le plan PRO.',
            current_plan: user.plan,
            required_plan: 'pro',
            upgrade_url: '/pricing'
        };
    }

    // 2. Construire le prompt selon le type d'analyse
    const analysisPrompts = {
        competitor_ad: `Analyse cette publicité concurrente et donne des recommandations pour la surpasser sur le marché africain :
"${text}"

Retourne un JSON avec : { "forces": [], "faiblesses": [], "recommandations": [], "score": 0-10, "strategie_contre": "..." }`,

        my_performance: `Analyse les performances de cette campagne publicitaire et donne des recommandations d'amélioration :
"${text}"

Retourne un JSON avec : { "diagnostic": "...", "points_forts": [], "points_faibles": [], "actions_immediates": [], "score_global": 0-10 }`,

        audience_insight: `Analyse cette audience cible et propose des insights pour mieux la cibler sur Facebook Ads au Cameroun :
"${text}"

Retourne un JSON avec : { "profil_type": "...", "motivations": [], "freins": [], "canaux_preferes": [], "messages_cles": [], "meilleur_moment_pub": "..." }`
    };

    const prompt = analysisPrompts[analysisType] || analysisPrompts.competitor_ad;

    // 3. Appeler l'IA
    const modelUsed = (USE_CLAUDE_FOR_PRO && (user.plan === 'pro' || user.plan === 'agency'))
        ? CLAUDE_MODEL : GEMINI_MODEL;

    const rawResponse = await _callAI(user.plan, prompt);
    const analysis = _parseAIResponse(rawResponse);

    // 4. Logger
    await _logGeneration(userId, 'analysis', { text, analysisType }, analysis, modelUsed);

    return {
        success: true,
        analysis,
        analysis_type: analysisType,
        model_used: modelUsed
    };
}

/**
 * Retourne les infos de crédits IA de l'utilisateur
 */
async function getCreditsInfo(userId) {
    const { data: user, error } = await supabase
        .from('users')
        .select('plan, ai_credits')
        .eq('id', userId)
        .single();

    if (error || !user) {
        throw new Error('Utilisateur non trouvé');
    }

    const planConfig = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return {
        success: true,
        credits: user.ai_credits,
        max_credits: planConfig.ai_credits,
        unlimited: planConfig.unlimited,
        plan: user.plan,
        reset_date: nextMonth.toISOString().split('T')[0],
        provider: (USE_CLAUDE_FOR_PRO && (user.plan === 'pro' || user.plan === 'agency'))
            ? 'claude' : 'gemini'
    };
}

module.exports = {
    generateAdText,
    generateAudienceTargeting,
    analyzeContentForPro,
    getCreditsInfo,
    PLAN_LIMITS
};
