/**
 * AdSetForm — Étape 2 du wizard
 * Audience (localisation, âge, genre, intérêts) + Budget + Calendrier
 * Layout 2 colonnes : gauche = formulaire, droite = estimation audience
 */

import { useState, useMemo } from 'react';
import {
    MapPin, Calendar, DollarSign, ChevronLeft, ChevronRight,
    X, Plus, Sparkles, Info
} from 'lucide-react';
import AITargetingHelper from '../ai/AITargetingHelper';

const LOCATIONS = [
    'Cameroun', 'Douala', 'Yaoundé', 'Bafoussam', 'Garoua',
    'Bamenda', 'Maroua', 'Ngaoundéré', 'Edéa', 'Kribi'
];

const INTEREST_SUGGESTIONS = [
    'Sport', 'Mode', 'Tech', 'Voyage', 'Cuisine', 'Musique',
    'Fitness', 'Business', 'Beauté', 'Automobile', 'Éducation', 'Immobilier'
];

const OPTIMIZATION_LABELS = {
    'LINK_CLICKS': 'Clics sur le lien',
    'OUTCOME_ENGAGEMENT': 'Engagement sur la publication',
    'OUTCOME_LEADS': 'Prospects',
    'OUTCOME_SALES': 'Conversions',
    'OUTCOME_AWARENESS': 'Portée maximale',
    'APP_INSTALLS': "Installations d'application"
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
        if (targeting.locations.includes('Cameroun')) base = 5000000;
        else base = targeting.locations.length * 300000;

        const ageRange = (targeting.age_max - targeting.age_min) / 47;
        base *= ageRange;

        if (targeting.genders.length === 1) base *= 0.5;
        if (targeting.interests.length > 0) base *= (0.3 + targeting.interests.length * 0.05);

        const min = Math.max(1000, Math.round(base * 0.6));
        const max = Math.round(base * 1.4);
        return { min, max };
    }, [targeting]);

    const getAudienceColor = () => {
        if (audienceEstimate.min < 10000) return '#EF4444';
        if (audienceEstimate.min > 1000000) return '#F59E0B';
        return '#10B981';
    };

    const getAudienceLabel = () => {
        if (audienceEstimate.min < 10000) return 'Votre audience est trop restreinte';
        if (audienceEstimate.min > 1000000) return 'Votre audience est très large';
        return 'Votre sélection est assez spécifique';
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

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
                Définissez votre audience et votre budget
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* LEFT — Form (3/5) */}
                <div className="lg:col-span-3 space-y-6">

                    {/* === SECTION A: AUDIENCE === */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-8 hover:shadow-md transition-shadow duration-300">
                        <div className="pb-4 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 rounded-lg">
                                    <MapPin size={22} className="text-emerald-500" />
                                </div>
                                Audience
                            </h3>
                            <p className="text-sm text-gray-500 mt-1 ml-11">Définissez qui verra vos publicités</p>
                        </div>

                        {/* 1. Localisation */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">
                                Où se trouvent vos clients ? <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={locationSearch}
                                    onChange={(e) => { setLocationSearch(e.target.value); setShowLocationDropdown(true); }}
                                    onFocus={() => setShowLocationDropdown(true)}
                                    placeholder="Rechercher une ville ou un pays..."
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all placeholder-gray-400 text-sm font-medium text-gray-900"
                                />
                                {showLocationDropdown && filteredLocations.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        {filteredLocations.map(loc => (
                                            <button
                                                key={loc}
                                                onClick={() => addLocation(loc)}
                                                className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-sm text-gray-700 transition-colors"
                                            >
                                                <MapPin size={14} className="inline mr-2 text-gray-400" />
                                                {loc}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Selected tags */}
                            {targeting.locations.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {targeting.locations.map(loc => (
                                        <span key={loc} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-sm font-medium shadow-sm">
                                            {loc}
                                            <button onClick={() => removeLocation(loc)} className="hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-50">
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 2. Âge */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">
                                Âge <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1 max-w-[140px]">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">De</span>
                                    <select
                                        value={targeting.age_min}
                                        onChange={(e) => updateTargeting('age_min', parseInt(e.target.value))}
                                        className="w-full pl-10 pr-8 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none text-sm font-medium text-gray-900 transition-all appearance-none"
                                    >
                                        {Array.from({ length: 48 }, (_, i) => 18 + i).map(age => (
                                            <option key={age} value={age}>{age}</option>
                                        ))}
                                    </select>
                                </div>
                                <span className="text-sm font-medium text-gray-400">—</span>
                                <div className="relative flex-1 max-w-[140px]">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">À</span>
                                    <select
                                        value={targeting.age_max}
                                        onChange={(e) => updateTargeting('age_max', parseInt(e.target.value))}
                                        className="w-full pl-10 pr-8 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none text-sm font-medium text-gray-900 transition-all appearance-none"
                                    >
                                        {Array.from({ length: 48 }, (_, i) => 18 + i).map(age => (
                                            <option key={age} value={age}>{age}</option>
                                        ))}
                                    </select>
                                </div>
                                <span className="text-sm font-medium text-gray-500 ml-1">ans</span>
                            </div>
                        </div>

                        {/* 3. Genre */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">
                                Genre <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-3">
                                {[
                                    { value: [], label: 'Tous' },
                                    { value: ['male'], label: 'Hommes' },
                                    { value: ['female'], label: 'Femmes' }
                                ].map(opt => {
                                    const isSelected = JSON.stringify(targeting.genders) === JSON.stringify(opt.value);
                                    return (
                                        <button
                                            key={opt.label}
                                            onClick={() => updateTargeting('genders', opt.value)}
                                            className={`
                        px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border
                        ${isSelected
                                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)]'
                                                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                                                }
                      `}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 4. Ciblage détaillé */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">
                                Affinez votre audience <span className="text-xs font-normal text-gray-400 ml-1">(optionnel)</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={interestInput}
                                    onChange={(e) => setInterestInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); addInterest(interestInput); }
                                    }}
                                    placeholder="Ex: Mode masculine, E-commerce, Football..."
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none text-sm font-medium text-gray-900 transition-all placeholder-gray-400"
                                />
                                <button
                                    onClick={() => addInterest(interestInput)}
                                    disabled={!interestInput.trim()}
                                    className="px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-sm"
                                >
                                    Ajouter
                                </button>
                            </div>

                            {/* Suggestions */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                {INTEREST_SUGGESTIONS
                                    .filter(s => !targeting.interests.includes(s))
                                    .slice(0, 8)
                                    .map(suggestion => (
                                        <button
                                            key={suggestion}
                                            onClick={() => addInterest(suggestion)}
                                            className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                                        >
                                            + {suggestion}
                                        </button>
                                    ))}
                            </div>

                            {/* Selected interests */}
                            {targeting.interests.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {targeting.interests.map(interest => (
                                        <span key={interest} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-sm font-medium shadow-sm">
                                            {interest}
                                            <button onClick={() => removeInterest(interest)} className="hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-50">
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* AI Targeting Button */}
                        <div className="pt-2 border-t border-gray-100">
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
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-8 hover:shadow-md transition-shadow duration-300">
                        <div className="pb-4 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 rounded-lg">
                                    <DollarSign size={22} className="text-emerald-500" />
                                </div>
                                Budget et Calendrier
                            </h3>
                            <p className="text-sm text-gray-500 mt-1 ml-11">Maîtrisez vos dépenses publicitaires</p>
                        </div>

                        {/* Budget type */}
                        <div>
                            <div className="flex gap-4 mb-4">
                                {[
                                    { value: 'daily', label: 'Budget journalier', sub: 'recommandé' },
                                    { value: 'lifetime', label: 'Budget total', sub: '' }
                                ].map(opt => (
                                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="budget_type"
                                            value={opt.value}
                                            checked={budget_type === opt.value}
                                            onChange={() => updateField('budget_type', opt.value)}
                                            className="w-4 h-4 text-emerald-500 focus:ring-emerald-500"
                                        />
                                        <span className="text-sm text-gray-700">{opt.label}</span>
                                        {opt.sub && <span className="text-xs text-emerald-500 font-medium">({opt.sub})</span>}
                                    </label>
                                ))}
                            </div>

                            {/* Budget input + slider */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={daily_budget}
                                            onChange={(e) => updateField('daily_budget', Math.max(1000, parseInt(e.target.value) || 1000))}
                                            min={1000}
                                            step={500}
                                            className="w-36 pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none text-base font-bold text-gray-900 transition-all text-right"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                                            FCFA
                                        </span>
                                    </div>
                                    <span className="text-sm font-medium text-gray-500">/ {budget_type === 'daily' ? 'jour' : 'total'}</span>
                                </div>
                                <input
                                    type="range"
                                    min={1000}
                                    max={50000}
                                    step={500}
                                    value={daily_budget}
                                    onChange={(e) => updateField('daily_budget', parseInt(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-emerald-500"
                                />
                                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                                    <Info size={14} className="text-blue-500 flex-shrink-0" />
                                    <span className="text-xs text-blue-600">
                                        💡 Facebook recommande 5 000 FCFA/jour minimum pour des résultats optimaux
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Calendrier */}
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                                        Date de début
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                            <Calendar size={18} />
                                        </div>
                                        <input
                                            type="date"
                                            value={start_date ? new Date(start_date).toISOString().split('T')[0] : ''}
                                            onChange={(e) => updateField('start_date', e.target.value ? new Date(e.target.value) : new Date())}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none text-sm font-medium text-gray-900 transition-all appearance-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                                        Date de fin <span className="text-xs font-normal text-gray-400 ml-1">(optionnel)</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                            <Calendar size={18} />
                                        </div>
                                        <input
                                            type="date"
                                            disabled={!end_date}
                                            value={end_date ? new Date(end_date).toISOString().split('T')[0] : ''}
                                            onChange={(e) => updateField('end_date', e.target.value ? new Date(e.target.value) : null)}
                                            className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none text-sm font-medium transition-all appearance-none
                                                ${!end_date
                                                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                                    : 'border-gray-200 bg-gray-50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 text-gray-900'
                                                }`}
                                        />
                                    </div>
                                </div>
                            </div>
                            <label className="inline-flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center justify-center">
                                    <input
                                        type="checkbox"
                                        checked={!end_date}
                                        onChange={(e) => updateField('end_date', e.target.checked ? null : new Date())}
                                        className="w-5 h-5 border-2 border-gray-300 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 transition-colors cursor-pointer group-hover:border-emerald-400"
                                    />
                                </div>
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Diffusion continue (pas de date de fin)</span>
                            </label>
                        </div>

                        {/* Optimization goal */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">Optimisation de diffusion</label>
                            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                                <Sparkles size={16} className="text-emerald-500" />
                                <span className="text-sm font-medium text-emerald-700">
                                    {OPTIMIZATION_LABELS[objective] || 'Portée maximale'}
                                </span>
                            </div>
                        </div>

                        {/* Total estimate */}
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-600">Budget total estimé</span>
                                <span className="text-lg font-bold text-gray-900">
                                    {typeof totalEstimate === 'number'
                                        ? `${totalEstimate.toLocaleString('fr-FR')} FCFA`
                                        : totalEstimate
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT — Audience Estimation (2/5) */}
                <div className="lg:col-span-2">
                    <div className="lg:sticky lg:top-24 space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-6 flex items-center gap-2">
                                <Sparkles size={16} className="text-emerald-500" />
                                Estimation des résultats
                            </h4>

                            {/* Gauge */}
                            <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.min(100, Math.max(10, (audienceEstimate.min / 2000000) * 100))}%`,
                                        backgroundColor: getAudienceColor()
                                    }}
                                />
                            </div>

                            <p className="text-2xl font-bold text-gray-900 mb-1">
                                {formatNumber(audienceEstimate.min)} — {formatNumber(audienceEstimate.max)}
                            </p>
                            <p className="text-xs text-gray-500">personnes</p>

                            <p className="mt-3 text-sm" style={{ color: getAudienceColor() }}>
                                {getAudienceLabel()}
                            </p>

                            {/* Summary */}
                            <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Localisation</span>
                                    <span className="text-gray-700 font-medium">
                                        {targeting.locations.length > 0 ? targeting.locations.join(', ') : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Âge</span>
                                    <span className="text-gray-700 font-medium">{targeting.age_min} — {targeting.age_max} ans</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Genre</span>
                                    <span className="text-gray-700 font-medium">
                                        {targeting.genders.length === 0 ? 'Tous' : targeting.genders.includes('male') ? 'Hommes' : 'Femmes'}
                                    </span>
                                </div>
                                {targeting.interests.length > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Intérêts</span>
                                        <span className="text-gray-700 font-medium">{targeting.interests.length}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
                <button
                    onClick={onPrev}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                >
                    <ChevronLeft size={18} />
                    Précédent
                </button>
                <button
                    onClick={onNext}
                    disabled={!isValid}
                    className={`
            flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200
            ${isValid
                            ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200'
                            : 'bg-gray-300 cursor-not-allowed'
                        }
          `}
                >
                    Suivant
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
};

export default AdSetForm;
