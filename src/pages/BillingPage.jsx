/**
 * BillingPage — Gestion du plan & Upgrade
 * AdsFacile Frontend
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Loader2, Rocket, Calendar, Zap, CreditCard,
    Download, FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PricingCard from '../components/billing/PricingCard';
import PaymentModal from '../components/billing/PaymentModal';
import DashboardLayout from '../components/layout/DashboardLayout';
import './BillingPage.css';

const BillingPage = () => {
    const { user } = useAuth();
    const [plans, setPlans] = useState([]);
    const [subscription, setSubscription] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [plansRes, subRes, invRes] = await Promise.allSettled([
                api.get('/billing/plans'),
                api.get('/billing/subscription'),
                api.get('/billing/invoices')
            ]);

            if (plansRes.status === 'fulfilled' && plansRes.value.data.success) {
                setPlans(plansRes.value.data.data.plans);
            }
            if (subRes.status === 'fulfilled' && subRes.value.data.success) {
                setSubscription(subRes.value.data.data);
            }
            if (invRes.status === 'fulfilled' && invRes.value.data.success) {
                setInvoices(invRes.value.data.data.invoices);
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
                        {invoices.length === 0 ? (
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
                                            <th>Méthode</th>
                                            <th>Statut</th>
                                            <th>Facture</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map((inv, i) => (
                                            <tr key={i}>
                                                <td>{new Date(inv.date).toLocaleDateString('fr-FR')}</td>
                                                <td><span className={`plan-name-badge plan-${inv.plan}`}>{inv.plan_name}</span></td>
                                                <td>{inv.amount?.toLocaleString()} FCFA</td>
                                                <td>{inv.method}</td>
                                                <td>
                                                    <span className={`status-badge ${inv.status}`}>
                                                        {inv.status === 'paid' ? 'Payé' : inv.status === 'pending' ? 'En attente' : 'Échoué'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button className="invoice-download" title="Télécharger">
                                                        <Download size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* ─── Payment Modal ─── */}
            {selectedPlan && (
                <PaymentModal
                    plan={selectedPlan}
                    onClose={() => setSelectedPlan(null)}
                    onSuccess={handleUpgradeSuccess}
                />
            )}
        </DashboardLayout>
    );
};

export default BillingPage;
