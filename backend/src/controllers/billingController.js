/**
 * Contrôleur Billing — Plans, Paiements SasPay & Historique
 * AdsFacile Backend
 *
 * Encaissement Mobile Money multi-pays via SasPay (remplace CamPay, oct. 2026).
 * Clé sk_test_ = paiements simulés ; sk_live_ = argent réel.
 */

const { supabase, supabaseAdmin } = require('../config/supabase');
const saspayService = require('../services/saspayService');
const saspayConfig = require('../config/saspay');
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
// GET PRICING PLANS
// ═══════════════════════════════════════════════════════════════════════════════

const getPricingPlans = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            data: {
                plans: PLANS,
                sandbox_mode: saspayConfig.isTestMode
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
// INITIATE UPGRADE (SasPay Mobile Money)
// ═══════════════════════════════════════════════════════════════════════════════

const initiateUpgrade = async (req, res) => {
    try {
        const userId = req.user.id;
        const { target_plan, country, network, phone, otp } = req.body;

        if (!target_plan || !country || !network) {
            return res.status(400).json({
                success: false,
                message: 'Plan, pays et réseau de paiement requis'
            });
        }

        const targetPlanObj = PLANS.find(p => p.id === target_plan);
        if (!targetPlanObj || targetPlanObj.price === 0) {
            return res.status(400).json({ success: false, message: 'Plan invalide' });
        }

        const telephone = String(phone || '').replace(/[^\d+]/g, '');
        if (telephone.replace('+', '').length < 8) {
            return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide' });
        }

        // Le réseau doit exister et encaisser pour ce compte SasPay : on le
        // vérifie avant de créer quoi que ce soit.
        const choix = await saspayService.findNetwork(country, network);
        if (!choix) {
            return res.status(400).json({
                success: false,
                message: "Ce réseau de paiement n'est pas disponible dans ce pays."
            });
        }

        const tarif = prixPourDevise(targetPlanObj.price, choix.country.currency);

        if (choix.network.otp_required && !otp) {
            return res.status(400).json({
                success: false,
                code: 'otp_required',
                message: choix.network.otp_instructions || 'Ce réseau demande un code de paiement préalable.'
            });
        }

        const { data: user } = await supabase
            .from('users')
            .select('plan, email, first_name, last_name')
            .eq('id', userId)
            .single();

        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
        }

        if ((PLAN_ORDER[target_plan] ?? 0) <= (PLAN_ORDER[user.plan] ?? 0)) {
            return res.status(400).json({
                success: false,
                message: 'Vous ne pouvez pas rétrograder depuis cette page'
            });
        }

        const externalRef = saspayService.generateExternalReference();
        const frais = tarif.local ? saspayService.computePayinFee(tarif.amount, choix.network.tiers) : null;

        const { data: payment, error: dbError } = await supabase
            .from('payments')
            .insert({
                user_id: userId,
                amount: tarif.amount,
                real_amount: targetPlanObj.price,
                currency: tarif.currency,
                target_plan,
                payment_method: network,
                phone_number: telephone,
                operator: choix.network.name,
                country,
                provider: 'saspay',
                status: 'pending',
                external_reference: externalRef
            })
            .select('id')
            .single();

        if (dbError) {
            logger.error('❌ DB error creating payment:', dbError);
            return res.status(500).json({ success: false, message: 'Erreur création du paiement' });
        }

        let saspay;
        try {
            saspay = await saspayService.initiatePayment({
                amount: tarif.amount,
                currency: tarif.currency,
                country,
                network,
                phone: telephone,
                customer: {
                    email: user.email,
                    first_name: user.first_name || 'Client',
                    last_name: user.last_name || 'AdsFacile'
                },
                description: `AdsFacile ${targetPlanObj.name} — 1 mois`,
                externalReference: externalRef,
                metadata: { payment_id: payment.id, user_id: userId, target_plan },
                otp
            });
        } catch (err) {
            await supabase.from('payments')
                .update({ status: 'failed', updated_at: new Date().toISOString() })
                .eq('id', payment.id);
            throw err;
        }

        await supabase
            .from('payments')
            .update({ provider_reference: saspay.id })
            .eq('id', payment.id);

        logger.info(`✅ SasPay payment initiated: ${saspay.id} (${tarif.amount} ${tarif.currency}, ${country}/${network})`);

        return res.status(200).json({
            success: true,
            data: {
                payment_id: payment.id,
                reference: saspay.id,
                external_reference: externalRef,
                amount: tarif.amount,
                fee: frais,
                total: frais === null ? null : tarif.amount + frais,
                currency: tarif.currency,
                target_plan,
                plan_name: targetPlanObj.name,
                network,
                operator: choix.network.name,
                checkout_url: saspay.checkout_url || null,
                status: 'pending',
                sandbox_mode: saspayConfig.isTestMode
            }
        });

    } catch (error) {
        logger.error('❌ Erreur initiateUpgrade:', error.message);
        return res.status(error.status === 401 || error.status >= 500 ? 502 : 400).json({
            success: false,
            message: error.message || "Erreur lors de l'initiation du paiement"
        });
    }
};

/**
 * Montant à encaisser pour un pays.
 * Les plans sont fixés en FCFA : XAF et XOF sont à parité (1 = 1), donc même
 * montant dans la devise locale. Ailleurs (GHS, KES, CDF…), le prix part en
 * XAF et SasPay convertit ; s'il refuse, son message est rendu au client.
 * `local` indique si les frais SasPay (exprimés en devise locale) peuvent être
 * calculés d'avance.
 */
function prixPourDevise(prixFcfa, devise) {
    if (devise === 'XAF' || devise === 'XOF') return { amount: prixFcfa, currency: devise, local: true };
    return { amount: prixFcfa, currency: 'XAF', local: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT NETWORKS (pays et réseaux SasPay disponibles)
// ═══════════════════════════════════════════════════════════════════════════════

const getPaymentNetworks = async (req, res) => {
    try {
        const pays = await saspayService.listPaymentNetworks();
        const plan = PLANS.find(p => p.id === req.query.plan);

        const data = pays
            .map(p => ({
                code: p.code,
                name: p.name,
                currency: p.currency,
                networks: p.networks.map(n => {
                    const tarif = plan ? prixPourDevise(plan.price, p.currency) : null;
                    const fee = tarif && tarif.local ? saspayService.computePayinFee(tarif.amount, n.tiers) : null;
                    return {
                        code: n.code,
                        name: n.name,
                        otp_required: n.otp_required,
                        otp_instructions: n.otp_instructions,
                        amount: tarif ? tarif.amount : null,
                        amount_currency: tarif ? tarif.currency : null,
                        fee,
                        total: tarif && fee !== null ? tarif.amount + fee : null
                    };
                })
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

        return res.json({ success: true, data: { countries: data, sandbox_mode: saspayConfig.isTestMode } });
    } catch (error) {
        logger.error('❌ Erreur getPaymentNetworks:', error.message);
        return res.status(502).json({ success: false, message: 'Impossible de charger les moyens de paiement. Réessayez dans un instant.' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FINALISATION (idempotente)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Passe un paiement « pending » à son statut final, une seule fois.
 * La mise à jour est conditionnée à status='pending' : un webhook rejoué ou
 * un polling concurrent ne réactive jamais le plan une seconde fois.
 * @returns {Promise<string>} statut final
 */
async function finaliserPaiement(payment, nouveauStatut) {
    if (nouveauStatut === 'pending') return payment.status;

    const { data: modifies } = await supabaseAdmin
        .from('payments')
        .update({ status: nouveauStatut, updated_at: new Date().toISOString() })
        .eq('id', payment.id)
        .eq('status', 'pending')
        .select('id');

    if (!modifies || modifies.length === 0) {
        // Déjà finalisé par un autre canal (webhook ou polling).
        return nouveauStatut;
    }

    if (nouveauStatut === 'successful') {
        try {
            await activatePlan(payment.user_id, payment.target_plan);
            logger.info(`🎉 Plan ${payment.target_plan} activé pour user ${payment.user_id}`);
        } catch (err) {
            logger.error('❌ Erreur activation plan:', err.message);
            await supabaseAdmin.from('payments')
                .update({ status: 'activation_failed', updated_at: new Date().toISOString() })
                .eq('id', payment.id);
            return 'activation_failed';
        }
    }
    return nouveauStatut;
}

/** Retrouve un paiement par référence SasPay (ou CamPay pour l'historique). */
async function trouverPaiement(reference, userId = null) {
    for (const colonne of ['provider_reference', 'campay_reference']) {
        let q = supabaseAdmin.from('payments').select('*').eq(colonne, reference);
        if (userId) q = q.eq('user_id', userId);
        const { data } = await q.maybeSingle();
        if (data) return data;
    }
    return null;
}

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

        const payment = await trouverPaiement(reference, userId);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Paiement introuvable' });
        }

        let statut = payment.status;
        if (statut === 'pending' && payment.provider === 'saspay') {
            const verif = await saspayService.checkPaymentStatus(reference);
            statut = await finaliserPaiement(payment, verif.status);
        }

        return res.json({
            success: true,
            data: { status: statut, payment_id: payment.id, target_plan: payment.target_plan }
        });

    } catch (error) {
        logger.error('❌ Erreur check payment status:', error.message);
        return res.status(502).json({ success: false, message: 'Statut du paiement indisponible pour le moment.' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRM OTP (code reçu par SMS après la demande de paiement)
// ═══════════════════════════════════════════════════════════════════════════════

const confirmPaymentOtp = async (req, res) => {
    try {
        const { reference, otp } = req.body;
        if (!reference || !otp) {
            return res.status(400).json({ success: false, message: 'Référence et code requis' });
        }
        const payment = await trouverPaiement(reference, req.user.id);
        if (!payment) return res.status(404).json({ success: false, message: 'Paiement introuvable' });

        const r = await saspayService.confirmOtp(reference, String(otp).trim());
        const statut = await finaliserPaiement(payment, r.status);
        return res.json({ success: true, data: { status: statut, payment_id: payment.id } });
    } catch (error) {
        logger.error('❌ Erreur confirmPaymentOtp:', error.message);
        return res.status(400).json({ success: false, message: error.message || 'Code refusé' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK SASPAY (corps brut, signature HMAC)
// ═══════════════════════════════════════════════════════════════════════════════

const handleWebhook = async (req, res) => {
    try {
        // Corps brut fourni par express.raw (server.js) : la signature porte
        // sur les octets reçus, pas sur un JSON re-sérialisé.
        const brut = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
        const valide = saspayService.verifyWebhookSignature(
            brut,
            req.headers['x-webhook-signature'],
            req.headers['x-webhook-timestamp']
        );
        if (!valide) {
            logger.error('❌ Webhook SasPay : signature invalide ou expirée');
            return res.status(403).json({ error: 'invalid_signature' });
        }

        const { event, data } = JSON.parse(brut.toString('utf8'));
        logger.info(`📬 Webhook SasPay ${event} pour ${data?.id}`);

        if (!['transaction.success', 'transaction.failed', 'transaction.cancelled'].includes(event)) {
            return res.json({ success: true, ignored: event });
        }

        const payment = await trouverPaiement(data?.id);
        if (!payment) {
            // 200 : pas un abonnement AdsFacile, inutile que SasPay le renvoie.
            logger.warn(`⚠️ Webhook SasPay : paiement inconnu ${data?.id}`);
            return res.json({ success: true, ignored: 'unknown_payment' });
        }

        const statut = await finaliserPaiement(payment, saspayService.normalizeStatus(data.status));
        return res.json({ success: true, status: statut });

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
            .select('id, amount, real_amount, currency, target_plan, payment_method, operator, phone_number, status, provider, provider_reference, country, campay_reference, external_reference, created_at')
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
    getPaymentNetworks,
    confirmPaymentOtp,
    handleWebhook,
    getPaymentHistory,
    getPaymentMethodStatus
};
