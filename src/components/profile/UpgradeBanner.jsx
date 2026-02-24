/**
 * Composant UpgradeBanner
 * Banner gradient pour inciter à passer PRO
 */

import { Link } from 'react-router-dom';
import { Rocket } from 'lucide-react';

const UpgradeBanner = ({ currentPlan = 'free' }) => {
    if (currentPlan === 'pro' || currentPlan === 'agency') return null;

    const targetPlan = currentPlan === 'free' ? 'PRO' : 'PRO';
    const price = '12,000';

    return (
        <div className="upgrade-banner">
            <div className="upgrade-banner-content">
                <Rocket size={20} />
                <div>
                    <strong>Débloquez toutes les fonctionnalités avec le plan {targetPlan}</strong>
                    <p>Campagnes illimitées, IA avancée, analytics détaillés</p>
                </div>
            </div>
            <div className="upgrade-banner-action">
                <span className="upgrade-price">{price} FCFA / mois</span>
                <Link to="/plans" className="upgrade-btn">
                    Passer à {targetPlan}
                </Link>
            </div>
        </div>
    );
};

export default UpgradeBanner;
