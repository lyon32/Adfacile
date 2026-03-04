/**
 * FeatureGate — Plan-gated wrapper
 * Renders children blurred with an upgrade overlay if user plan < required plan
 */

import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

const PLAN_ORDER = { free: 0, starter: 1, pro: 2, agency: 3 };
const PLAN_LABELS = { starter: 'Starter', pro: 'PRO', agency: 'Agency' };
const PLAN_PRICES = { starter: '5 000', pro: '12 000', agency: '25 000' };

const FeatureGate = ({ requiredPlan = 'pro', currentPlan = 'free', featureName, children }) => {
    const userLevel = PLAN_ORDER[currentPlan] ?? 0;
    const requiredLevel = PLAN_ORDER[requiredPlan] ?? 0;

    if (userLevel >= requiredLevel) {
        return children;
    }

    return (
        <div className="analytics-gate-wrap">
            <div className="analytics-gate-blur">
                {children}
            </div>
            <div className="analytics-gate-overlay">
                <div className="analytics-gate-content">
                    <div className="analytics-gate-lock-icon">
                        <Lock size={28} />
                    </div>
                    <h4 className="analytics-gate-title">{featureName}</h4>
                    <p className="analytics-gate-text">
                        Disponible avec le plan {PLAN_LABELS[requiredPlan] || requiredPlan}
                    </p>
                    <Link to="/plans" className="analytics-gate-btn">
                        Passer à {PLAN_LABELS[requiredPlan]} — {PLAN_PRICES[requiredPlan]} FCFA/mois
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default FeatureGate;
