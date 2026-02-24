/**
 * Contrôleur IA — Endpoints génération textes & ciblage
 * AdsFacile Backend
 */

const {
    generateAdText,
    generateAudienceTargeting,
    analyzeContentForPro,
    getCreditsInfo
} = require('../services/aiService');
const logger = require('../utils/logger');

/**
 * POST /api/ai/generate-text
 * Génère 3 variations de texte publicitaire
 */
const generateText = async (req, res) => {
    try {
        const { product, niche, audience, tone, city } = req.body;

        // Validation des champs requis
        if (!product || !niche) {
            return res.status(400).json({
                success: false,
                message: 'Les champs "product" et "niche" sont requis.'
            });
        }

        const result = await generateAdText({
            userId: req.user.id,
            product,
            niche,
            audience: audience || 'Tous',
            tone: tone || 'friendly',
            city: city || 'Douala'
        });

        // Crédits épuisés
        if (!result.success && result.error === 'credits_exhausted') {
            return res.status(403).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        logger.error('❌ Erreur génération texte IA:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération IA. Veuillez réessayer.',
            ...(process.env.NODE_ENV === 'development' && { detail: error.message })
        });
    }
};

/**
 * POST /api/ai/targeting
 * Génère 3 propositions de ciblage audience
 */
const generateTargeting = async (req, res) => {
    try {
        const { niche, city, budget } = req.body;

        if (!niche) {
            return res.status(400).json({
                success: false,
                message: 'Le champ "niche" est requis.'
            });
        }

        const result = await generateAudienceTargeting({
            userId: req.user.id,
            niche,
            city: city || 'Douala',
            budget: budget || 5000
        });

        if (!result.success && result.error === 'credits_exhausted') {
            return res.status(403).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        logger.error('❌ Erreur génération ciblage IA:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération du ciblage. Veuillez réessayer.',
            ...(process.env.NODE_ENV === 'development' && { detail: error.message })
        });
    }
};

/**
 * POST /api/ai/analyze
 * Analyse avancée IA (PRO/Agency uniquement)
 */
const analyzeContent = async (req, res) => {
    try {
        const { text, analysisType } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                message: 'Le champ "text" est requis.'
            });
        }

        const validTypes = ['competitor_ad', 'my_performance', 'audience_insight'];
        if (analysisType && !validTypes.includes(analysisType)) {
            return res.status(400).json({
                success: false,
                message: `Le type d'analyse doit être l'un de : ${validTypes.join(', ')}`
            });
        }

        const result = await analyzeContentForPro({
            userId: req.user.id,
            text,
            analysisType: analysisType || 'competitor_ad'
        });

        if (!result.success && result.error === 'upgrade_required') {
            return res.status(403).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        logger.error('❌ Erreur analyse IA:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'analyse. Veuillez réessayer.',
            ...(process.env.NODE_ENV === 'development' && { detail: error.message })
        });
    }
};

/**
 * GET /api/ai/credits
 * Retourne les infos de crédits IA de l'utilisateur
 */
const getCredits = async (req, res) => {
    try {
        const result = await getCreditsInfo(req.user.id);
        return res.status(200).json(result);
    } catch (error) {
        logger.error('❌ Erreur récupération crédits IA:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des crédits.'
        });
    }
};

module.exports = {
    generateText,
    generateTargeting,
    analyzeContent,
    getCredits
};
