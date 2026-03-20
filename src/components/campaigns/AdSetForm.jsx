/**
 * AdSetForm — Étape 2 du wizard
 * Audience (localisation, âge, genre, intérêts) + Budget + Calendrier
 * Layout 2 colonnes : gauche = formulaire, droite = estimation audience
 */

import { useState, useMemo } from 'react';
import {
    MapPin, Calendar, DollarSign, ChevronLeft, ChevronRight,
    X, Plus, Sparkles, Info, Users, Target
} from 'lucide-react';
import AITargetingHelper from '../ai/AITargetingHelper';
import '../../styles/adset-form.css';

const LOCATIONS = [
    'Cameroun', 'Douala', 'Yaoundé', 'Bafoussam', 'Garoua',
    'Bamenda', 'Maroua', 'Ngaoundéré', 'Edéa', 'Kribi'
];

const INTEREST_SUGGESTIONS = [
    'Sport', 'Mode', 'Tech', 'Voyage', 'Cuisine', 'Musique',
    'Fitness', 'Business', 'Beauté', 'Automobile', 'Éducation', 'Immobilier'
];

const OPTIMIZATION_LABELS = {
    'OUTCOME_TRAFFIC': 'Clics sur le lien',
    'OUTCOME_ENGAGEMENT': 'Engagement sur la publication',
    'OUTCOME_LEADS': 'Prospects',
    'OUTCOME_SALES': 'Conversions',
    'OUTCOME_AWARENESS': 'Portée maximale',
    'OUTCOME_APP_PROMOTION': "Installations d'application"
};

const AdSetForm = ({ campaignData, setCampaignData, user, onNext, onPrev }) => {
    const [locationSearch, setLocationSearch] = useState('');
    const [interestInput, setInterestInput] = useState('');
    const [showLocationDropdown, setShowLocationDropdown] = useState(false);

    const { targeting, daily_budget, budget_type, start_date, end_date, objective } = campaignData;

    const updateTargeting = (field, value) => {
        setCampaignData(prev => ({
            ...prev,
            targeting: { ...prev.targeting, [field]: value }
        }));
    };

    const updateField = (field, value) => {
        setCampaignData(prev => ({ ...prev, [field]: value }));
    };

    // Location management
    const filteredLocations = LOCATIONS.filter(
        loc => !targeting.locations.includes(loc) &&
            loc.toLowerCase().includes(locationSearch.toLowerCase())
    );

    const addLocation = (loc) => {
        updateTargeting('locations', [...targeting.locations, loc]);
        setLocationSearch('');
        setShowLocationDropdown(false);
    };

    const removeLocation = (loc) => {
        updateTargeting('locations', targeting.locations.filter(l => l !== loc));
    };

    // Interest management
    const addInterest = (interest) => {
        if (interest.trim() && !targeting.interests.includes(interest.trim())) {
            updateTargeting('interests', [...targeting.interests, interest.trim()]);
        }
        setInterestInput('');
    };

    const removeInterest = (interest) => {
        updateTargeting('interests', targeting.interests.filter(i => i !== interest));
    };

    // Audience estimation (simplified)
    const audienceEstimate = useMemo(() => {
        let base = 500000;
        if (targeting.locations.length === 0) base = 100000; // Default when empty
        else if (targeting.locations.includes('Cameroun')) base = 5000000;
        else base = targeting.locations.length * 300000;

        // Prevent age range from being negative or zero
        let ageDiff = targeting.age_max - targeting.age_min;
        if (ageDiff <= 0) ageDiff = 1;

        const ageRange = ageDiff / 47;
        base *= ageRange;

        if (targeting.genders.length === 1) base *= 0.5;
        if (targeting.interests.length > 0) base *= (0.3 + targeting.interests.length * 0.05);

        const min = Math.max(1000, Math.round(base * 0.6));
        const max = Math.max(min + 1000, Math.round(base * 1.4));
        return { min, max };
    }, [targeting]);

    const getAudienceColor = () => {
        if (audienceEstimate.min < 10000) return '#EF4444';
        if (audienceEstimate.min > 1000000) return '#F59E0B';
        return '#10B981';
    };

    const getAudienceLabel = () => {
        if (audienceEstimate.min < 10000) return 'Audience trop restreinte';
        if (audienceEstimate.min > 1000000) return 'Audience très large';
        return 'Taille optimale ✓';
    };

    const formatNumber = (n) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${Math.round(n / 1000)}K`;
        return n.toString();
    };

    // Budget calculation
    const totalEstimate = useMemo(() => {
        if (!start_date) return daily_budget;
        if (!end_date) return daily_budget + ' FCFA/jour (continu)';
        const days = Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24));
        return daily_budget * Math.max(1, days);
    }, [daily_budget, start_date, end_date]);

    // Validation
    const isValid = targeting.locations.length > 0 &&
        targeting.age_min >= 18 &&
        targeting.age_max <= 65 &&
        daily_budget >= 1000;

    const rangePct = Math.round(((daily_budget - 1000) / (50000 - 1000)) * 100);

    return (
        <div>
            <h2 className="adset-page-title">
                Définissez votre audience et votre budget
            </h2>

            <div className="adset-grid">
                {/* LEFT — Form */}
                <div className="adset-left">

                    {/* === SECTION A: AUDIENCE === */}
                    <div className="adset-card">
                        <div className="adset-section-header">
                            <div className="adset-section-icon audience">
                                <Target size={22} />
                            </div>
                            <div>
                                <h3 className="adset-section-title">Ciblage d'audience</h3>
                                <p className="adset-section-subtitle">Définissez qui verra vos publicités</p>
                            </div>
                        </div>

                        {/* 1. Localisation */}
                        <div className="adset-field-group">
                            <label className="adset-label">
                                Localisation <span className="required">*</span>
                            </label>
                            <div className="adset-relative">
                                <input
                                    type="text"
                                    value={locationSearch}
                                    onChange={(e) => { setLocationSearch(e.target.value); setShowLocationDropdown(true); }}
                                    onFocus={() => setShowLocationDropdown(true)}
                                    placeholder="🔍 Rechercher une ville ou un pays..."
                                    className="adset-input"
                                />
                                {showLocationDropdown && filteredLocations.length > 0 && (
                                    <div className="adset-dropdown">
                                        {filteredLocations.map(loc => (
                                            <button
                                                key={loc}
                                                onClick={() => addLocation(loc)}
                                                className="adset-dropdown-item"
                                            >
                                                <MapPin size={15} />
                                                {loc}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {targeting.locations.length > 0 && (
                                <div className="adset-tags-row">
                                    {targeting.locations.map(loc => (
                                        <span key={loc} className="adset-tag location">
                                            <MapPin size={14} />
                                            {loc}
                                            <button onClick={() => removeLocation(loc)} className="adset-tag-remove">
                                                <X size={13} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 2. Âge */}
                        <div className="adset-field-group">
                            <label className="adset-label">
                                Tranche d'âge <span className="required">*</span>
                            </label>
                            <div className="adset-age-row">
                                <div className="adset-age-field">
                                    <span className="adset-age-prefix">Min</span>
                                    <select
                                        value={targeting.age_min}
                                        onChange={(e) => updateTargeting('age_min', parseInt(e.target.value))}
                                        className="adset-select"
                                    >
                                        {Array.from({ length: 48 }, (_, i) => 18 + i).map(age => (
                                            <option key={age} value={age}>{age}</option>
                                        ))}
                                    </select>
                                </div>
                                <span className="adset-age-separator">—</span>
                                <div className="adset-age-field">
                                    <span className="adset-age-prefix">Max</span>
                                    <select
                                        value={targeting.age_max}
                                        onChange={(e) => updateTargeting('age_max', parseInt(e.target.value))}
                                        className="adset-select"
                                    >
                                        {Array.from({ length: 48 }, (_, i) => 18 + i).map(age => (
                                            <option key={age} value={age}>{age}</option>
                                        ))}
                                    </select>
                                </div>
                                <span className="adset-age-suffix">ans</span>
                            </div>
                        </div>

                        {/* 3. Genre */}
                        <div className="adset-field-group">
                            <label className="adset-label">
                                Genre <span className="required">*</span>
                            </label>
                            <div className="adset-gender-group">
                                {[
                                    { value: [], label: 'Tous', icon: '👥' },
                                    { value: ['male'], label: 'Hommes', icon: '👨' },
                                    { value: ['female'], label: 'Femmes', icon: '👩' }
                                ].map(opt => {
                                    const isSelected = JSON.stringify(targeting.genders) === JSON.stringify(opt.value);
                                    return (
                                        <button
                                            key={opt.label}
                                            onClick={() => updateTargeting('genders', opt.value)}
                                            className={`adset-gender-btn ${isSelected ? 'active' : ''}`}
                                        >
                                            {opt.icon} {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 4. Ciblage détaillé */}
                        <div className="adset-field-group">
                            <label className="adset-label">
                                Centres d'intérêt <span className="optional">(optionnel)</span>
                            </label>
                            <div className="adset-interest-row">
                                <input
                                    type="text"
                                    value={interestInput}
                                    onChange={(e) => setInterestInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); addInterest(interestInput); }
                                    }}
                                    placeholder="Ex: Mode, E-commerce, Football..."
                                    className="adset-input"
                                    style={{ flex: 1 }}
                                />
                                <button
                                    onClick={() => addInterest(interestInput)}
                                    disabled={!interestInput.trim()}
                                    className="adset-interest-add-btn"
                                >
                                    <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                    Ajouter
                                </button>
                            </div>

                            {/* Suggestions */}
                            <div className="adset-suggestions">
                                {INTEREST_SUGGESTIONS
                                    .filter(s => !targeting.interests.includes(s))
                                    .slice(0, 8)
                                    .map(suggestion => (
                                        <button
                                            key={suggestion}
                                            onClick={() => addInterest(suggestion)}
                                            className="adset-suggestion-chip"
                                        >
                                            + {suggestion}
                                        </button>
                                    ))}
                            </div>

                            {/* Selected interests */}
                            {targeting.interests.length > 0 && (
                                <div className="adset-tags-row" style={{ marginTop: 14 }}>
                                    {targeting.interests.map(interest => (
                                        <span key={interest} className="adset-tag interest">
                                            {interest}
                                            <button onClick={() => removeInterest(interest)} className="adset-tag-remove">
                                                <X size={13} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* AI Targeting Button */}
                        <div className="adset-ai-divider">
                            <AITargetingHelper
                                niche={user?.business_niche || user?.niche || 'Autre'}
                                city={targeting.locations[0] || 'Douala'}
                                budget={daily_budget}
                                onApplyStrategy={(strategy) => {
                                    setCampaignData(prev => ({
                                        ...prev,
                                        targeting: {
                                            ...prev.targeting,
                                            age_min: strategy.age_min || prev.targeting.age_min,
                                            age_max: strategy.age_max || prev.targeting.age_max,
                                            genders: strategy.gender === 'all' ? [] : (strategy.gender ? [strategy.gender] : prev.targeting.genders),
                                            interests: strategy.interests || prev.targeting.interests,
                                            behaviors: strategy.behaviors || prev.targeting.behaviors
                                        }
                                    }));
                                }}
                            />
                        </div>
                    </div>

                    {/* === SECTION B: BUDGET & CALENDRIER === */}
                    <div className="adset-card">
                        <div className="adset-section-header">
                            <div className="adset-section-icon budget">
                                <DollarSign size={22} />
                            </div>
                            <div>
                                <h3 className="adset-section-title">Budget & Calendrier</h3>
                                <p className="adset-section-subtitle">Maîtrisez vos dépenses publicitaires</p>
                            </div>
                        </div>

                        {/* Budget type toggle */}
                        <div className="adset-field-group">
                            <div className="adset-budget-toggles">
                                {[
                                    { value: 'daily', label: 'Journalier', sub: 'recommandé' },
                                    { value: 'lifetime', label: 'Total', sub: '' }
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => updateField('budget_type', opt.value)}
                                        className={`adset-budget-toggle ${budget_type === opt.value ? 'active' : ''}`}
                                    >
                                        {opt.label}
                                        {opt.sub && <span className="sub-label">{opt.sub}</span>}
                                    </button>
                                ))}
                            </div>

                            {/* Budget amount */}
                            <div className="adset-budget-amount-row">
                                <div className="adset-budget-input-wrapper">
                                    <input
                                        type="number"
                                        value={daily_budget}
                                        onChange={(e) => updateField('daily_budget', Math.max(1000, parseInt(e.target.value) || 1000))}
                                        min={1000}
                                        step={500}
                                        className="adset-budget-input"
                                    />
                                    <span className="adset-budget-currency">FCFA</span>
                                </div>
                                <span className="adset-budget-per">/ {budget_type === 'daily' ? 'jour' : 'total'}</span>
                            </div>

                            {/* Slider */}
                            <input
                                type="range"
                                min={1000}
                                max={50000}
                                step={500}
                                value={daily_budget}
                                onChange={(e) => updateField('daily_budget', parseInt(e.target.value))}
                                className="adset-range"
                                style={{ '--range-pct': `${rangePct}%` }}
                            />

                            {/* Info */}
                            <div className="adset-info-banner">
                                <Info size={16} className="info-icon" />
                                <span className="info-text">
                                    💡 Facebook recommande 5 000 FCFA/jour minimum pour des résultats optimaux
                                </span>
                            </div>
                        </div>

                        {/* Calendrier */}
                        <div className="adset-field-group">
                            <div className="adset-date-grid">
                                <div>
                                    <label className="adset-label">Date de début</label>
                                    <div className="adset-date-field">
                                        <div className="adset-date-icon">
                                            <Calendar size={16} />
                                        </div>
                                        <input
                                            type="date"
                                            value={start_date ? new Date(start_date).toISOString().split('T')[0] : ''}
                                            onChange={(e) => updateField('start_date', e.target.value ? new Date(e.target.value) : new Date())}
                                            className="adset-date-input"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="adset-label">
                                        Date de fin <span className="optional">(optionnel)</span>
                                    </label>
                                    <div className="adset-date-field">
                                        <div className="adset-date-icon">
                                            <Calendar size={16} />
                                        </div>
                                        <input
                                            type="date"
                                            disabled={!end_date}
                                            value={end_date ? new Date(end_date).toISOString().split('T')[0] : ''}
                                            onChange={(e) => updateField('end_date', e.target.value ? new Date(e.target.value) : null)}
                                            className="adset-date-input"
                                        />
                                    </div>
                                </div>
                            </div>
                            <label className="adset-checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={!end_date}
                                    onChange={(e) => updateField('end_date', e.target.checked ? null : new Date())}
                                    className="adset-checkbox"
                                />
                                <span className="adset-checkbox-label">Diffusion continue (pas de date de fin)</span>
                            </label>
                        </div>

                        {/* Optimization */}
                        <div className="adset-field-group">
                            <label className="adset-label">Optimisation de la diffusion</label>
                            <div className="adset-opt-pill">
                                <Sparkles size={16} className="opt-icon" />
                                <span className="opt-text">
                                    {OPTIMIZATION_LABELS[objective] || 'Portée maximale'}
                                </span>
                            </div>
                        </div>

                        {/* Total estimate (dark bar) */}
                        <div className="adset-total-bar">
                            <span className="adset-total-label">Budget total estimé</span>
                            <span className="adset-total-value">
                                {typeof totalEstimate === 'number'
                                    ? `${totalEstimate.toLocaleString('fr-FR')} FCFA`
                                    : totalEstimate
                                }
                            </span>
                        </div>
                    </div>
                </div>

                {/* RIGHT — Audience Estimation */}
                <div>
                    <div className="adset-estimation-panel">
                        <div className="adset-estimation-card">
                            <div className="adset-est-header">
                                <div className="adset-est-header-icon">
                                    <Users size={15} />
                                </div>
                                <span className="adset-est-header-text">Estimation des résultats</span>
                            </div>

                            {/* Gauge */}
                            <div className="adset-gauge-track">
                                <div
                                    className="adset-gauge-fill"
                                    style={{
                                        width: `${Math.min(100, Math.max(10, (audienceEstimate.min / 2000000) * 100))}%`,
                                        color: getAudienceColor()
                                    }}
                                />
                            </div>

                            <p className="adset-est-number">
                                {formatNumber(audienceEstimate.min)} — {formatNumber(audienceEstimate.max)}
                            </p>
                            <p className="adset-est-unit">personnes estimées</p>

                            <p className="adset-est-status" style={{ color: getAudienceColor() }}>
                                {getAudienceLabel()}
                            </p>

                            <hr className="adset-est-divider" />

                            {/* Summary */}
                            <div className="adset-est-summary">
                                <div className="adset-est-row">
                                    <span className="adset-est-row-label">📍 Localisation</span>
                                    <span className="adset-est-row-value">
                                        {targeting.locations.length > 0 ? targeting.locations.join(', ') : '—'}
                                    </span>
                                </div>
                                <div className="adset-est-row">
                                    <span className="adset-est-row-label">🎂 Âge</span>
                                    <span className="adset-est-row-value">{targeting.age_min} — {targeting.age_max} ans</span>
                                </div>
                                <div className="adset-est-row">
                                    <span className="adset-est-row-label">👤 Genre</span>
                                    <span className="adset-est-row-value">
                                        {targeting.genders.length === 0 ? 'Tous' : targeting.genders.includes('male') ? 'Hommes' : 'Femmes'}
                                    </span>
                                </div>
                                {targeting.interests.length > 0 && (
                                    <div className="adset-est-row">
                                        <span className="adset-est-row-label">🎯 Intérêts</span>
                                        <span className="adset-est-row-value">{targeting.interests.length} sélectionnés</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="adset-nav">
                <button onClick={onPrev} className="adset-btn-prev">
                    <ChevronLeft size={18} />
                    Précédent
                </button>
                <button
                    onClick={onNext}
                    disabled={!isValid}
                    className="adset-btn-next"
                >
                    Suivant
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
};

export default AdSetForm;
