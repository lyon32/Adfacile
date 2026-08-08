/**
 * Conversion FCFA → USD affichée à côté des champs de budget.
 *
 * Le taux vient de l'API (/api/config/currency) et non d'une constante locale :
 * le montant montré doit être exactement celui que le backend enverra à Meta.
 * Si l'appel échoue, on n'affiche rien plutôt qu'un chiffre potentiellement faux.
 *
 * AdsFacile Frontend
 */

import { useEffect, useState } from 'react';

const RAW_BASE = import.meta.env.VITE_API_URL || '';
let API_BASE = '';
try {
    API_BASE = RAW_BASE ? new URL(RAW_BASE).origin : '';
} catch {
    API_BASE = RAW_BASE.replace(/\/api\/?$/, '');
}

// Partagé entre toutes les instances : le taux ne change pas en cours de session
let cachedRate = null;
let inFlight = null;

const fetchRate = () => {
    if (cachedRate) return Promise.resolve(cachedRate);
    if (!inFlight) {
        inFlight = fetch(`${API_BASE}/api/config/currency`)
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                cachedRate = json?.data || null;
                return cachedRate;
            })
            .catch(() => null)
            .finally(() => { inFlight = null; });
    }
    return inFlight;
};

/**
 * @param {Object} props
 * @param {number|string} props.amount - Montant saisi, en FCFA
 * @param {string} [props.suffix] - Texte ajouté après le montant (ex. « / jour »)
 */
const CurrencyHint = ({ amount, suffix = '' }) => {
    const [config, setConfig] = useState(cachedRate);

    useEffect(() => {
        let alive = true;
        fetchRate().then((c) => { if (alive) setConfig(c); });
        return () => { alive = false; };
    }, []);

    const value = Number(amount);
    if (!config || !Number.isFinite(value) || value <= 0) return null;

    const usd = value / config.xaf_per_usd;
    const belowMinimum = value < config.min_daily_budget_xaf;

    return (
        <p className={`currency-hint ${belowMinimum ? 'below-min' : ''}`}>
            <span className="currency-hint-amount">
                ≈ {usd.toLocaleString('fr-FR', { style: 'currency', currency: config.account_currency })}
                {suffix}
            </span>
            <span className="currency-hint-rate">
                {belowMinimum
                    ? `Minimum ${config.min_daily_budget_xaf.toLocaleString('fr-FR')} FCFA — Facebook exige 1 $ par jour`
                    : `au taux de ${config.xaf_per_usd.toLocaleString('fr-FR')} FCFA pour 1 $`}
            </span>
        </p>
    );
};

export default CurrencyHint;
