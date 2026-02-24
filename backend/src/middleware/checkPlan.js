/**
 * Middleware de vérification du plan utilisateur
 * AdsFacile Backend
 * 
 * Usage : router.get('/feature', authenticate, checkPlan('pro'), handler)
 */

// Hiérarchie des plans (ordre croissant)
const PLAN_ORDER = {
    free: 0,
    starter: 1,
    pro: 2,
    agency: 3
};

/**
 * Higher-Order Function qui retourne un middleware Express
 * Vérifie que le plan de l'utilisateur est >= au plan requis
 * 
 * @param {string} requiredPlan - Plan minimum requis ('free'|'starter'|'pro'|'agency')
 * @returns {Function} Express middleware
 */
const checkPlan = (requiredPlan) => {
    return (req, res, next) => {
        const userPlan = req.user?.plan || 'free';
        const userLevel = PLAN_ORDER[userPlan] ?? 0;
        const requiredLevel = PLAN_ORDER[requiredPlan] ?? 0;

        if (userLevel >= requiredLevel) {
            return next();
        }

        // Plan insuffisant → 403
        return res.status(403).json({
            success: false,
            error: 'upgrade_required',
            message: `Cette fonctionnalité nécessite le plan ${requiredPlan.toUpperCase()}.`,
            current_plan: userPlan,
            required_plan: requiredPlan,
            upgrade_url: '/pricing'
        });
    };
};

/**
 * Vérifie si un plan a accès à un autre plan
 * Utile dans les services/controllers
 * 
 * @param {string} userPlan - Plan de l'utilisateur
 * @param {string} requiredPlan - Plan requis
 * @returns {boolean}
 */
const canAccessPlan = (userPlan, requiredPlan) => {
    return (PLAN_ORDER[userPlan] ?? 0) >= (PLAN_ORDER[requiredPlan] ?? 0);
};

/**
 * Retourne le prochain plan recommandé pour upgrade
 * 
 * @param {string} currentPlan - Plan actuel
 * @returns {string|null} Plan suivant ou null si déjà au max
 */
const getUpgradePath = (currentPlan) => {
    if (currentPlan === 'free') return 'starter';
    if (currentPlan === 'starter') return 'pro';
    if (currentPlan === 'pro') return 'agency';
    return null;
};

module.exports = { checkPlan, canAccessPlan, getUpgradePath, PLAN_ORDER };
