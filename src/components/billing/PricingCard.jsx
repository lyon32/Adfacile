/**
 * PricingCard — Carte de plan tarifaire
 * AdsFacile Frontend
 */

import { Check, Star } from 'lucide-react';

const PricingCard = ({ plan, currentPlanId, onSelect }) => {
    const isCurrentPlan = plan.id === currentPlanId;
    const PLAN_ORDER = { free: 0, starter: 1, pro: 2, agency: 3 };
    const currentLevel = PLAN_ORDER[currentPlanId] ?? 0;
    const planLevel = PLAN_ORDER[plan.id] ?? 0;
    const isUpgrade = planLevel > currentLevel;
    const isDowngrade = planLevel < currentLevel;

    return (
        <div className={`pricing-card ${plan.popular ? 'popular' : ''} ${isCurrentPlan ? 'current' : ''}`}>
            {plan.popular && (
                <div className="pricing-popular-badge">
                    <Star size={12} />
                    POPULAIRE
                </div>
            )}

            <h3 className="pricing-plan-name">{plan.name}</h3>

            <div className="pricing-price">
                {plan.price === 0 ? (
                    <>
                        <span className="pricing-amount">0</span>
                        <span className="pricing-currency">FCFA</span>
                    </>
                ) : (
                    <>
                        <span className="pricing-amount">{plan.price.toLocaleString()}</span>
                        <span className="pricing-currency">FCFA</span>
                        <span className="pricing-period">/{plan.period}</span>
                    </>
                )}
            </div>

            <ul className="pricing-features">
                {plan.features.map((feature, index) => (
                    <li key={index}>
                        <Check size={16} className="pricing-check" />
                        <span>{feature}</span>
                    </li>
                ))}
            </ul>

            <div className="pricing-action">
                {isCurrentPlan ? (
                    <button className="pricing-btn current" disabled>
                        Plan actuel
                    </button>
                ) : isUpgrade ? (
                    <button
                        className={`pricing-btn upgrade ${plan.popular ? 'popular' : ''}`}
                        onClick={() => onSelect(plan)}
                    >
                        Passer à {plan.name}
                    </button>
                ) : isDowngrade ? (
                    <button className="pricing-btn downgrade" disabled>
                        Rétrograder
                    </button>
                ) : null}
            </div>
        </div>
    );
};

export default PricingCard;
