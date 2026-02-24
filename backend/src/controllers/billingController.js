/**
 * Contrôleur Billing — Plans & Paiements
 * AdsFacile Backend
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// PLANS (Hardcodé — pas en DB)
// ═══════════════════════════════════════════════════════════════════════════════

const PLANS = [
    {
        id: 'free',
        name: 'Gratuit',
        price: 0,
        currency: 'FCFA',
        period: 'toujours',
        features: [
            '1 campagne Facebook/mois',
            '3 crédits IA/mois',
            'Dashboard stats basiques',
            'Connexion 1 compte Facebook',
            'Support email'
        ],
        limits: { campaigns: 1, ai_credits: 3, accounts: 1 }
    },
    {
        id: 'starter',
        name: 'Starter',
        price: 5000,
        currency: 'FCFA',
        period: 'mois',
        features: [
            '5 campagnes/mois',
            '20 crédits IA/mois',
            'Audit site web (1/mois)',
            'Export rapports PDF',
            'Support prioritaire'
        ],
        limits: { campaigns: 5, ai_credits: 20, accounts: 1 }
    },
    {
        id: 'pro',
        name: 'PRO',
        price: 12000,
        currency: 'FCFA',
        period: 'mois',
        popular: true,
        features: [
            'Campagnes ILLIMITÉES',
            'IA crédits ILLIMITÉS',
            'Analytics avancés + graphiques',
            'Analyse concurrence Facebook',
            'Audit site web illimité',
            'Multi-comptes Facebook',
            'Recommandations IA avancées',
            'Support WhatsApp dédié'
        ],
        limits: { campaigns: 99999, ai_credits: 99999, accounts: 5 }
    },
    {
        id: 'agency',
        name: 'Agency',
        price: 30000,
        currency: 'FCFA',
        period: 'mois',
        features: [
            'Tout PRO inclus',
            'Clients illimités',
            'Rapports marque blanche',
            'API AdsFacile accès',
            'Tableau de bord multi-clients',
            'Account manager dédié'
        ],
        limits: { campaigns: 99999, ai_credits: 99999, accounts: 99999 }
    }
];

const PLAN_ORDER = { free: 0, starter: 1, pro: 2, agency: 3 };

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/billing/plans
 * Retourne tous les plans disponibles (public)
 */
const getPricingPlans = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            data: { plans: PLANS }
        });
    } catch (error) {
        logger.error('❌ Erreur getPricingPlans:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

/**
 * GET /api/billing/subscription
 * Retourne l'abonnement actuel de l'utilisateur
 */
const getCurrentSubscription = async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('plan, ai_credits, created_at')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
        }

        const currentPlan = PLANS.find(p => p.id === user.plan) || PLANS[0];
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        return res.status(200).json({
            success: true,
            data: {
                current_plan: currentPlan,
                ai_credits_used: currentPlan.limits.ai_credits - user.ai_credits,
                ai_credits_remaining: user.ai_credits,
                campaigns_this_month: 0, // TODO: compter depuis campaigns table
                reset_date: nextMonth.toISOString().split('T')[0],
                member_since: user.created_at
            }
        });
    } catch (error) {
        logger.error('❌ Erreur getCurrentSubscription:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

/**
 * POST /api/billing/upgrade
 * Initie un upgrade de plan (paiement Mobile Money)
 */
const initiateUpgrade = async (req, res) => {
    try {
        const { target_plan, payment_method, phone } = req.body;

        // Validation
        if (!target_plan || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'Plan cible et méthode de paiement requis'
            });
        }

        const targetPlanObj = PLANS.find(p => p.id === target_plan);
        if (!targetPlanObj) {
            return res.status(400).json({ success: false, message: 'Plan invalide' });
        }

        // Vérifier que c'est bien un upgrade
        const { data: user } = await supabase
            .from('users')
            .select('plan')
            .eq('id', req.user.id)
            .single();

        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
        }

        const currentLevel = PLAN_ORDER[user.plan] ?? 0;
        const targetLevel = PLAN_ORDER[target_plan] ?? 0;

        if (targetLevel <= currentLevel) {
            return res.status(400).json({
                success: false,
                message: 'Vous ne pouvez pas rétrograder depuis cette page'
            });
        }

        // Créer une référence de paiement
        const reference = `ADS-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // TODO: Appel MeSomb API pour initier le paiement Mobile Money
        // Pour le moment, on simule la création du payment intent
        const paymentIntent = {
            reference,
            amount: targetPlanObj.price,
            currency: 'XAF',
            target_plan: target_plan,
            payment_method: payment_method, // 'mtn' | 'orange'
            phone: phone || '',
            status: 'pending',
            user_id: req.user.id,
            created_at: new Date().toISOString()
        };

        // Logger l'intention de paiement
        logger.info(`💳 Payment intent créé: ${reference} — ${target_plan} — ${targetPlanObj.price} FCFA`);

        // TODO: Stocker en base quand la table payments existe
        // await supabase.from('payments').insert(paymentIntent);

        return res.status(200).json({
            success: true,
            data: {
                reference,
                amount: targetPlanObj.price,
                currency: 'FCFA',
                target_plan: target_plan,
                plan_name: targetPlanObj.name,
                payment_method,
                status: 'pending',
                message: `Veuillez confirmer le paiement de ${targetPlanObj.price.toLocaleString()} FCFA sur votre téléphone`
            }
        });
    } catch (error) {
        logger.error('❌ Erreur initiateUpgrade:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur lors de l\'initiation du paiement' });
    }
};

/**
 * GET /api/billing/invoices
 * Retourne l'historique des factures
 */
const getInvoices = async (req, res) => {
    try {
        // TODO: Implémenter quand la table payments/invoices existe
        // Pour le moment retourner une liste vide
        return res.status(200).json({
            success: true,
            data: { invoices: [] }
        });
    } catch (error) {
        logger.error('❌ Erreur getInvoices:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

module.exports = {
    getPricingPlans,
    getCurrentSubscription,
    initiateUpgrade,
    getInvoices
};
