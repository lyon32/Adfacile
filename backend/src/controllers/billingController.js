/**
 * Contrôleur Billing — Plans, Paiements CamPay & Historique
 * AdsFacile Backend
 *
 * Intégration CamPay Mobile Money (MTN & Orange)
 * Mode Sandbox par défaut pour tests
 */

const { supabase, supabaseAdmin } = require('../config/supabase');
const campayService = require('../services/campayService');
const campayConfig = require('../config/campay');
const logger = require('../utils/logger');
const { GRAPH_URL } = require('../config/facebook');

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
        price: 25, // ⚠️ TEMPORAIRE: 25 XAF pour test CamPay sandbox (prix réel: 5000)
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
// GET PRICING PLANS
// ═══════════════════════════════════════════════════════════════════════════════

const getPricingPlans = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            data: {
                plans: PLANS,
                sandbox_mode: campayConfig.env === 'sandbox'
            }
        });
    } catch (error) {
        logger.error('❌ Erreur getPricingPlans:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET CURRENT SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

const getCurrentSubscription = async (req, res) => {
    try {
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('plan, plan_expires_at, ai_credits, created_at')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            logger.error(`❌ getCurrentSubscription: user not found for id=${req.user.id}, error=${JSON.stringify(error)}`);
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
        }

        // ─── Auto-repair: vérifier si un paiement "successful" n'a pas activé le plan ───
        const { data: successfulPayments } = await supabase
            .from('payments')
            .select('id, target_plan')
            .eq('user_id', req.user.id)
            .eq('status', 'successful')
            .order('created_at', { ascending: false })
            .limit(1);

        if (successfulPayments && successfulPayments.length > 0) {
            const latestPayment = successfulPayments[0];
            const paymentPlanLevel = PLAN_ORDER[latestPayment.target_plan] ?? 0;
            const currentPlanLevel = PLAN_ORDER[user.plan] ?? 0;

            if (paymentPlanLevel > currentPlanLevel) {
                logger.warn(`⚠️ Auto-repair: user ${req.user.id} should be on ${latestPayment.target_plan} but is on ${user.plan}. Activating...`);
                try {
                    await activatePlan(req.user.id, latestPayment.target_plan);
                    // Re-fetch user data after fix
                    const { data: fixedUser } = await supabase
                        .from('users')
                        .select('plan, plan_expires_at, ai_credits, created_at')
                        .eq('id', req.user.id)
                        .single();
                    if (fixedUser) {
                        Object.assign(user, fixedUser);
                    }
                    logger.info(`🎉 Auto-repair: Plan ${latestPayment.target_plan} activé pour user ${req.user.id}`);
                } catch (repairErr) {
                    logger.error('❌ Auto-repair failed:', repairErr.message);
                }
            }
        }

        // Compter les campagnes ce mois
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: campaignsThisMonth } = await supabase
            .from('campaigns')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', req.user.id)
            .gte('created_at', startOfMonth.toISOString());

        const currentPlan = PLANS.find(p => p.id === user.plan) || PLANS[0];
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        return res.status(200).json({
            success: true,
            data: {
                current_plan: currentPlan,
                plan_expires_at: user.plan_expires_at || null,
                ai_credits_used: currentPlan.limits.ai_credits >= 99999
                    ? 0
                    : Math.max(0, currentPlan.limits.ai_credits - user.ai_credits),
                ai_credits_remaining: user.ai_credits,
                campaigns_this_month: campaignsThisMonth || 0,
                reset_date: nextMonth.toISOString().split('T')[0],
                member_since: user.created_at
            }
        });
    } catch (error) {
        logger.error('❌ Erreur getCurrentSubscription:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INITIATE UPGRADE (CamPay Mobile Money)
// ═══════════════════════════════════════════════════════════════════════════════

const initiateUpgrade = async (req, res) => {
    try {
        const userId = req.user.id;
        const { target_plan, payment_method, phone } = req.body;

        // Validations
        if (!target_plan || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'Plan cible et méthode de paiement requis'
            });
        }

        const targetPlanObj = PLANS.find(p => p.id === target_plan);
        if (!targetPlanObj || targetPlanObj.price === 0) {
            return res.status(400).json({ success: false, message: 'Plan invalide' });
        }

        if (!phone || !phone.match(/^\+237\d{9}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Numéro invalide (format: +237XXXXXXXXX)'
            });
        }

        // Vérifier que c'est bien un upgrade
        const { data: user } = await supabase
            .from('users')
            .select('plan')
            .eq('id', userId)
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

        // Calculer montant (en sandbox: max 25 XAF)
        const realAmount = targetPlanObj.price;
        const chargeAmount = campayConfig.env === 'sandbox'
            ? Math.min(realAmount, campayConfig.maxTestAmount)
            : realAmount;

        // Générer external reference
        const externalRef = campayService.generateExternalReference();
        const operator = campayService.getOperatorFromPhone(phone);

        // Créer enregistrement payment en base (status: pending)
        const { data: payment, error: dbError } = await supabase
            .from('payments')
            .insert({
                user_id: userId,
                amount: chargeAmount,
                real_amount: realAmount,
                currency: 'XAF',
                target_plan: target_plan,
                payment_method: payment_method,
                phone_number: phone,
                operator: operator,
                status: 'pending',
                external_reference: externalRef
            })
            .select('id')
            .single();

        if (dbError) {
            logger.error('❌ DB error creating payment:', dbError);
            return res.status(500).json({ success: false, message: 'Erreur création du paiement' });
        }

        const paymentId = payment.id;

        // Appel CamPay
        logger.info(`💳 Initiating CamPay payment: ${chargeAmount} XAF → ${phone} (plan: ${target_plan})`);

        const campayResponse = await campayService.initiatePayment({
            amount: chargeAmount,
            phone: phone,
            description: `AdsFacile ${targetPlanObj.name} — 1 mois`,
            externalReference: externalRef
        });

        // Mettre à jour avec la référence CamPay
        await supabase
            .from('payments')
            .update({
                campay_reference: campayResponse.reference,
                operator: campayResponse.operator || operator
            })
            .eq('id', paymentId);

        logger.info(`✅ CamPay payment initiated: ref=${campayResponse.reference}`);

        return res.status(200).json({
            success: true,
            data: {
                payment_id: paymentId,
                reference: campayResponse.reference,
                external_reference: externalRef,
                amount: chargeAmount,
                real_amount: realAmount,
                currency: 'FCFA',
                target_plan: target_plan,
                plan_name: targetPlanObj.name,
                payment_method,
                operator: campayResponse.operator || operator,
                ussd_code: campayResponse.ussd_code || null,
                status: 'pending',
                sandbox_mode: campayConfig.env === 'sandbox',
                sandbox_info: campayConfig.env === 'sandbox' ? {
                    message: `Mode test — Montant facturé: ${chargeAmount} XAF (max sandbox: ${campayConfig.maxTestAmount} XAF)`,
                    test_numbers: campayConfig.testNumbers
                } : null
            }
        });

    } catch (error) {
        logger.error('❌ Erreur initiateUpgrade:', error.message);
        return res.status(400).json({
            success: false,
            message: error.message || 'Erreur lors de l\'initiation du paiement'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK PAYMENT STATUS (Polling from frontend)
// ═══════════════════════════════════════════════════════════════════════════════

const checkPaymentStatusEndpoint = async (req, res) => {
    try {
        const userId = req.user.id;
        const { reference } = req.query;

        if (!reference) {
            return res.status(400).json({ success: false, message: 'Référence requise' });
        }

        // Récupérer le paiement en base
        const { data: payment, error } = await supabase
            .from('payments')
            .select('*')
            .eq('campay_reference', reference)
            .eq('user_id', userId)
            .single();

        if (error || !payment) {
            return res.status(404).json({ success: false, message: 'Paiement introuvable' });
        }

        // Si déjà finalisé en base
        if (payment.status === 'successful' || payment.status === 'failed') {
            // Safety net: si le paiement est "successful" mais le plan n'a pas changé,
            // retenter l'activation (cas de race condition)
            if (payment.status === 'successful') {
                const { data: user } = await supabase
                    .from('users')
                    .select('plan')
                    .eq('id', userId)
                    .single();

                if (user && user.plan !== payment.target_plan) {
                    logger.warn(`⚠️ Plan mismatch detected! Payment successful for ${payment.target_plan} but user still on ${user.plan}. Retrying activation...`);
                    try {
                        await activatePlan(userId, payment.target_plan);
                        logger.info(`🎉 Plan ${payment.target_plan} activé (retry) pour user ${userId}`);
                    } catch (activateErr) {
                        logger.error('❌ Retry activation failed:', activateErr.message);
                    }
                }
            }

            return res.json({
                success: true,
                data: {
                    status: payment.status,
                    payment_id: payment.id,
                    target_plan: payment.target_plan
                }
            });
        }

        // Appeler CamPay pour statut actuel
        const campayStatus = await campayService.checkPaymentStatus(reference);
        const newStatus = campayStatus.status.toLowerCase();

        // Mettre à jour en base si changement
        if (newStatus !== payment.status) {
            // Si successful → activer le plan D'ABORD, puis mettre à jour le statut
            if (newStatus === 'successful') {
                try {
                    await activatePlan(userId, payment.target_plan);
                    logger.info(`🎉 Plan ${payment.target_plan} activé pour user ${userId}`);
                } catch (activateErr) {
                    logger.error('❌ Erreur activation plan:', activateErr.message);
                    // Marquer en erreur pour pouvoir retenter
                    await supabase
                        .from('payments')
                        .update({ status: 'activation_failed', updated_at: new Date().toISOString() })
                        .eq('id', payment.id);
                    return res.status(500).json({
                        success: false,
                        message: 'Paiement reçu mais erreur activation du plan. Veuillez réessayer.'
                    });
                }
            }

            // Mettre à jour le statut seulement après activation réussie
            await supabase
                .from('payments')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', payment.id);
        }

        return res.json({
            success: true,
            data: {
                status: newStatus,
                payment_id: payment.id,
                target_plan: payment.target_plan,
                reason: campayStatus.reason || null
            }
        });

    } catch (error) {
        logger.error('❌ Erreur check payment status:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK CAMPAY (callback automatique)
// ═══════════════════════════════════════════════════════════════════════════════

const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-campay-signature'];
        const payload = req.body;

        logger.info('📬 CamPay webhook received:', JSON.stringify(payload).substring(0, 200));

        // Vérifier signature
        if (!campayService.verifyWebhookSignature(payload, signature)) {
            logger.error('❌ Invalid webhook signature');
            return res.status(401).json({ error: 'invalid_signature' });
        }

        const { reference, status, external_reference } = payload;

        // Récupérer le paiement
        const { data: payment, error } = await supabase
            .from('payments')
            .select('*')
            .eq('campay_reference', reference)
            .single();

        if (error || !payment) {
            logger.error('❌ Payment not found for webhook:', reference);
            return res.status(404).json({ error: 'payment_not_found' });
        }

        const newStatus = status.toLowerCase();

        // Mettre à jour statut
        await supabase
            .from('payments')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', payment.id);

        // Si successful → activer plan
        if (newStatus === 'successful') {
            await activatePlan(payment.user_id, payment.target_plan);
            logger.info(`🎉 [Webhook] Plan ${payment.target_plan} activé pour user ${payment.user_id}`);
        }

        return res.json({ success: true });

    } catch (error) {
        logger.error('❌ Webhook error:', error.message);
        return res.status(500).json({ error: 'webhook_error' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATE PLAN (Internal helper)
// ═══════════════════════════════════════════════════════════════════════════════

async function activatePlan(userId, plan) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1); // +1 mois

    const credits = {
        free: 3,
        starter: 20,
        pro: 99999,
        agency: 99999
    };

    logger.info(`🔄 activatePlan: userId=${userId}, plan=${plan}, credits=${credits[plan] || 3}, expires=${expiresAt.toISOString()}`);

    const { data, error } = await supabaseAdmin
        .from('users')
        .update({
            plan: plan,
            plan_expires_at: expiresAt.toISOString(),
            ai_credits: credits[plan] || 3
        })
        .eq('id', userId)
        .select('id, plan, plan_expires_at, ai_credits');

    if (error) {
        logger.error('❌ Erreur activation plan:', JSON.stringify(error));
        throw new Error('Erreur activation du plan');
    }

    if (!data || data.length === 0) {
        logger.error(`❌ activatePlan: UPDATE returned 0 rows for userId=${userId}. User may not exist!`);
        throw new Error('Utilisateur introuvable lors de l\'activation du plan');
    }

    logger.info(`✅ activatePlan SUCCESS: user=${userId}, plan=${data[0].plan}, expires=${data[0].plan_expires_at}, credits=${data[0].ai_credits}`);

    // Logger dans audit_logs
    await supabaseAdmin.from('audit_logs').insert({
        user_id: userId,
        action: 'plan_upgraded',
        details: { new_plan: plan, expires_at: expiresAt.toISOString() }
    }).then(() => { }).catch(err => {
        logger.warn('⚠️ Audit log error:', err.message);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

const getPaymentHistory = async (req, res) => {
    try {
        const { data: payments, error } = await supabase
            .from('payments')
            .select('id, amount, real_amount, currency, target_plan, payment_method, operator, phone_number, status, campay_reference, external_reference, created_at')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            logger.error('❌ Erreur getPaymentHistory:', error);
            return res.status(500).json({ success: false, message: 'Erreur serveur' });
        }

        // Enrichir avec le nom du plan
        const enriched = (payments || []).map(p => ({
            ...p,
            plan_name: PLANS.find(pl => pl.id === p.target_plan)?.name || p.target_plan
        }));

        return res.status(200).json({
            success: true,
            data: { invoices: enriched }
        });

    } catch (error) {
        logger.error('❌ Erreur getPaymentHistory:', error.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT METHOD STATUS (Facebook Ad Account Funding Source)
// ═══════════════════════════════════════════════════════════════════════════════

const getPaymentMethodStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's Facebook credentials
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('fb_account_id, fb_access_token')
            .eq('id', userId)
            .single();

        if (userError || !user || !user.fb_account_id || !user.fb_access_token) {
            return res.status(200).json({
                success: true,
                data: {
                    has_payment_method: false,
                    ad_account_id: null,
                    message: 'Compte Facebook non connecté ou compte publicitaire manquant'
                }
            });
        }

        const adAccountId = `act_${user.fb_account_id}`;

        // Query Facebook Graph API for funding source
        const axios = require('axios');
        const fbRes = await axios.get(
            `${GRAPH_URL}/${adAccountId}`,
            {
                params: {
                    fields: 'funding_source_details,account_status',
                    access_token: user.fb_access_token
                }
            }
        );

        const fundingDetails = fbRes.data?.funding_source_details;
        const hasPayment = fundingDetails && fundingDetails.id;

        return res.status(200).json({
            success: true,
            data: {
                has_payment_method: !!hasPayment,
                ad_account_id: user.fb_account_id,
                payment_type: fundingDetails?.type || null,
                display_string: fundingDetails?.display_string || null,
                account_status: fbRes.data?.account_status || null
            }
        });

    } catch (error) {
        // If the FB API call fails (e.g., no permission), still return a safe response
        logger.error('❌ Erreur getPaymentMethodStatus:', error?.response?.data || error.message);
        return res.status(200).json({
            success: true,
            data: {
                has_payment_method: false,
                ad_account_id: null,
                message: 'Impossible de vérifier la méthode de paiement Facebook'
            }
        });
    }
};

module.exports = {
    getPricingPlans,
    getCurrentSubscription,
    initiateUpgrade,
    checkPaymentStatusEndpoint,
    handleWebhook,
    getPaymentHistory,
    getPaymentMethodStatus
};
