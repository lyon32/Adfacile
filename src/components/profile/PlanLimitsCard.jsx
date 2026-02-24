/**
 * Composant PlanLimitsCard
 * Affiche les limites du plan avec icônes ✅ / 🔒
 */

import { Check, Lock } from 'lucide-react';

const FEATURES = [
    { label: 'Campagnes / mois', free: '1', starter: '5', pro: 'Illimité', minPlan: 'free' },
    { label: 'Crédits IA / mois', free: '3', starter: '20', pro: 'Illimité', minPlan: 'free' },
    { label: 'Analytics avancés', free: false, starter: false, pro: true, minPlan: 'pro' },
    { label: 'Analyse concurrence', free: false, starter: false, pro: true, minPlan: 'pro' },
    { label: 'Audit site web', free: false, starter: '1/mois', pro: 'Illimité', minPlan: 'starter' },
    { label: 'Export PDF', free: false, starter: true, pro: true, minPlan: 'starter' },
    { label: 'Multi-comptes FB', free: false, starter: false, pro: true, minPlan: 'pro' },
];

const PLAN_ORDER = { free: 0, starter: 1, pro: 2, agency: 3 };
const PLAN_LABELS = { free: 'Gratuit', starter: 'Starter', pro: 'PRO', agency: 'Agency' };

const PlanLimitsCard = ({ plan = 'free', aiCredits = 0 }) => {
    const userLevel = PLAN_ORDER[plan] ?? 0;

    return (
        <div className="plan-limits-card">
            <h4 className="plan-limits-title">Mes limites (plan actuel)</h4>
            <ul className="plan-limits-list">
                {FEATURES.map((feature, index) => {
                    const requiredLevel = PLAN_ORDER[feature.minPlan] ?? 0;
                    const isAvailable = userLevel >= requiredLevel;
                    const value = feature[plan] || feature.free;

                    return (
                        <li key={index} className={`plan-limit-item ${isAvailable ? 'available' : 'locked'}`}>
                            {isAvailable ? (
                                <>
                                    <Check size={16} className="limit-icon check" />
                                    <span>
                                        {typeof value === 'string' ? `${value} ${feature.label.toLowerCase().includes('campagne') || feature.label.toLowerCase().includes('crédit') ? '' : ''}` : ''}
                                        {typeof value === 'boolean' && value ? '' : ''}
                                        {feature.label}
                                        {typeof value === 'string' && !feature.label.includes(value) ? ` (${value})` : ''}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Lock size={16} className="limit-icon lock" />
                                    <span>{feature.label}</span>
                                    <span className="plan-badge-mini">{PLAN_LABELS[feature.minPlan]}+</span>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default PlanLimitsCard;
