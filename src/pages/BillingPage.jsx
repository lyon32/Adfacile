/**
 * BillingPage — Gestion du plan & Upgrade via SasPay (Mobile Money multi-pays)
 * AdsFacile Frontend
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Loader2, Rocket, Calendar, Zap, CreditCard,
    Download, FileText, Shield, Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PricingCard from '../components/billing/PricingCard';
import PaymentModal from '../components/billing/PaymentModal';
import DashboardLayout from '../components/layout/DashboardLayout';
import './BillingPage.css';

const BillingPage = () => {
    const { user, refreshUser } = useAuth();
    const [plans, setPlans] = useState([]);
    const [subscription, setSubscription] = useState(null);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [sandboxMode, setSandboxMode] = useState(false);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [plansRes, subRes, payRes] = await Promise.allSettled([
                api.get('/billing/plans'),
                api.get('/billing/subscription'),
                api.get('/billing/payments')
            ]);

            if (plansRes.status === 'fulfilled' && plansRes.value.data.success) {
                setPlans(plansRes.value.data.data.plans);
                setSandboxMode(plansRes.value.data.data.sandbox_mode || false);
            }
            if (subRes.status === 'fulfilled' && subRes.value.data.success) {
                setSubscription(subRes.value.data.data);
            }
            if (payRes.status === 'fulfilled' && payRes.value.data.success) {
                setPayments(payRes.value.data.data.invoices || []);
            }
        } catch (err) {
            console.error('Erreur chargement billing:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpgradeSuccess = () => {
        setSelectedPlan(null);
        fetchAll();
    };

    const currentPlan = subscription?.current_plan;
    const resetDate = subscription?.reset_date
        ? new Date(subscription.reset_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';

    const PLAN_NAMES = { free: 'Gratuit', starter: 'Starter', pro: 'PRO', agency: 'Agency' };
    const STATUS_MAP = {
        successful: { label: 'Payé', class: 'paid' },
        pending: { label: 'En attente', class: 'pending' },
        failed: { label: 'Échoué', class: 'failed' },
        activation_failed: { label: 'Payé — activation en attente', class: 'pending' }
    };

    if (loading) {
        return (
            <DashboardLayout title="Gestion du plan">
                <div className="billing-loading">
                    <Loader2 size={32} className="billing-spin" />
                    <span>Chargement...</span>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Gestion du plan">
            <div className="billing-page">
                <div className="billing-container">

                    {/* ═══ SANDBOX BANNER ═══ */}
                    {sandboxMode && (
                        <div className="pm-sandbox-info" style={{ marginBottom: '1.5rem' }}>
                            <Info size={16} />
                            <div>
                                <strong>Mode test SasPay</strong>
                                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>
                                    Paiements simulés : aucun argent réel n’est débité.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ═══ SECTION 1 : MON PLAN ACTUEL ═══ */}
                    {currentPlan && (
                        <div className={`current-plan-card ${currentPlan.id === 'free' ? 'is-free' : 'is-paid'}`}>
                            <div className="current-plan-header">
                                <div>
                                    <span className="current-plan-label">Plan actuel</span>
                                    <div className="current-plan-name-row">
                                        <span className={`plan-name-badge plan-${currentPlan.id}`}>
                                            {currentPlan.name}
                                        </span>
                                        {currentPlan.price > 0 && (
                                            <span className="current-plan-price">
                                                {currentPlan.price.toLocaleString()} FCFA/{currentPlan.period}
                                            </span>
                                        )}
                                    </div>
                                    {subscription?.plan_expires_at && (
                                        <div className="current-plan-reset" style={{ marginTop: '0.5rem' }}>
                                            <Calendar size={14} />
                                            <span>Expire le {new Date(subscription.plan_expires_at).toLocaleDateString('fr-FR')}</span>
                                        </div>
                                    )}
                                </div>

                                {currentPlan.id === 'free' && (
                                    <button
                                        className="current-plan-upgrade-btn"
                                        onClick={() => setSelectedPlan(plans.find(p => p.id === 'pro'))}
                                    >
                                        <Rocket size={16} />
                                        Passer à PRO
                                    </button>
                                )}
                            </div>

                            {/* Usage */}
                            <div className="current-plan-usage">
                                <div className="usage-item">
                                    <div className="usage-info">
                                        <Zap size={14} />
                                        <span>Crédits IA</span>
                                        <span className="usage-value">
                                            {currentPlan.limits.ai_credits >= 99999
                                                ? '∞'
                                                : `${subscription.ai_credits_remaining}/${currentPlan.limits.ai_credits}`
                                            }
                                        </span>
                                    </div>
                                    {currentPlan.limits.ai_credits < 99999 && (
                                        <div className="usage-bar">
                                            <div
                                                className={`usage-fill ${subscription.ai_credits_remaining <= 0 ? 'depleted' : ''}`}
                                                style={{
                                                    width: `${Math.min(100, (subscription.ai_credits_remaining / currentPlan.limits.ai_credits) * 100)}%`
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="usage-item">
                                    <div className="usage-info">
                                        <CreditCard size={14} />
                                        <span>Campagnes ce mois</span>
                                        <span className="usage-value">
                                            {currentPlan.limits.campaigns >= 99999
                                                ? '∞'
                                                : `${subscription.campaigns_this_month}/${currentPlan.limits.campaigns}`
                                            }
                                        </span>
                                    </div>
                                    {currentPlan.limits.campaigns < 99999 && (
                                        <div className="usage-bar">
                                            <div
                                                className={`usage-fill ${subscription.campaigns_this_month >= currentPlan.limits.campaigns ? 'depleted' : ''}`}
                                                style={{
                                                    width: `${Math.min(100, (subscription.campaigns_this_month / currentPlan.limits.campaigns) * 100)}%`
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {resetDate && (
                                <div className="current-plan-reset">
                                    <Calendar size={14} />
                                    <span>Réinitialisation le {resetDate}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ SECTION 2 : PLANS DISPONIBLES ═══ */}
                    <section className="billing-section">
                        <h2>Plans disponibles</h2>
                        <div className="billing-plans-grid">
                            {plans.map(plan => (
                                <PricingCard
                                    key={plan.id}
                                    plan={plan}
                                    currentPlanId={currentPlan?.id || 'free'}
                                    onSelect={setSelectedPlan}
                                />
                            ))}
                        </div>
                    </section>

                    {/* ═══ SECTION 3 : HISTORIQUE PAIEMENTS ═══ */}
                    <section className="billing-section">
                        <h2>Historique des paiements</h2>
                        {payments.length === 0 ? (
                            <div className="billing-empty">
                                <FileText size={32} />
                                <p>Aucun paiement pour l'instant</p>
                            </div>
                        ) : (
                            <div className="billing-table-wrap">
                                <table className="billing-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Plan</th>
                                            <th>Montant</th>
                                            <th>Opérateur</th>
                                            <th>Statut</th>
                                            <th>Référence</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map((p, i) => {
                                            const statusInfo = STATUS_MAP[p.status] || { label: p.status, class: 'pending' };
                                            return (
                                                <tr key={p.id || i}>
                                                    <td>{new Date(p.created_at).toLocaleDateString('fr-FR', {
                                                        day: '2-digit', month: 'short', year: 'numeric'
                                                    })}</td>
                                                    <td>
                                                        <span className={`plan-name-badge plan-${p.target_plan}`}>
                                                            {p.plan_name || PLAN_NAMES[p.target_plan] || p.target_plan}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {(p.real_amount || p.amount)?.toLocaleString()} FCFA
                                                        {p.real_amount && p.amount !== p.real_amount && (
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>
                                                                (test: {p.amount} XAF)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {p.operator === 'MTN' ? (
                                                            <span style={{ color: '#FFCC00', fontWeight: 700 }}>MTN</span>
                                                        ) : p.operator === 'ORANGE' ? (
                                                            <span style={{ color: '#FF6600', fontWeight: 700 }}>Orange</span>
                                                        ) : (
                                                            p.operator || '—'
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge ${statusInfo.class}`}>
                                                            {statusInfo.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                        {(p.provider_reference || p.campay_reference)
                                                            ? (p.provider_reference || p.campay_reference).substring(0, 12) + '…'
                                                            : '—'
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {/* ═══ SECTION 4 : SÉCURITÉ ═══ */}
                    <div className="billing-security-footer">
                        <Shield size={14} />
                        <span>Paiements sécurisés par SasPay — Mobile Money dans 20 pays</span>
                    </div>
                </div>
            </div>

            {/* ─── Payment Modal ─── */}
            {selectedPlan && (
                <PaymentModal
                    plan={selectedPlan}
                    onClose={() => setSelectedPlan(null)}
                    onSuccess={handleUpgradeSuccess}
                    onRefreshUser={refreshUser}
                />
            )}
        </DashboardLayout>
    );
};

export default BillingPage;

