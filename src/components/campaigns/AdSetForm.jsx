/**
 * AdSetForm — Étape 2 du wizard
 * Audience (localisation, âge, genre, intérêts) + Budget + Calendrier
 * Layout 2 colonnes : gauche = formulaire, droite = estimation audience
 * 
 * Locations and interests use live Facebook Targeting Search API autocomplete.
 */

import { useState, useMemo, useEffect } from 'react';
import {
    MapPin, Calendar, DollarSign, ChevronLeft, ChevronRight,
    X, Plus, Sparkles, Info, Users, Target
} from 'lucide-react';
import AITargetingHelper from '../ai/AITargetingHelper';
import CurrencyHint from './CurrencyHint';
import '../../styles/adset-form.css';

const OPTIMIZATION_LABELS = {
    'LINK_CLICKS': 'Clics sur le lien',
    'OUTCOME_ENGAGEMENT': 'Engagement sur la publication',
    'OUTCOME_LEADS': 'Prospects',
    'OUTCOME_SALES': 'Conversions',
    'OUTCOME_AWARENESS': 'Portée maximale',
    'APP_INSTALLS': "Installations d'application"
};

// Objectifs de performance disponibles pour une campagne Trafic (OUTCOME_TRAFFIC),
// groupés comme dans Ads Manager natif : "Objectifs de trafic" puis "Autres objectifs".
const TRAFFIC_PERFORMANCE_GOAL_GROUPS = [
    {
        group: 'Objectifs de trafic',
        options: [
            {
                value: 'LANDING_PAGE_VIEWS',
                label: 'Maximiser le nombre de vues de la page de destination',
                description: 'Nous essaierons de montrer vos publicités aux personnes les plus susceptibles de consulter le site Web dont le lien se trouve dans la publicité.'
            },
            {
                value: 'LINK_CLICKS',
                label: 'Maximiser le nombre de clics sur un lien',
                description: 'Nous essaierons de montrer vos publicités aux personnes les plus susceptibles de cliquer sur celles-ci.'
            }
        ]
    },
    {
        group: 'Autres objectifs',
        options: [
            {
                value: 'REACH',
                label: 'Optimiser la couverture unique quotidienne',
                description: 'Nous essaierons de montrer vos publicités aux personnes jusqu’à une fois par jour.'
            },
            {
                value: 'CONVERSATIONS',
                label: 'Maximiser le nombre de conversations par messages',
                description: 'Nous essaierons de montrer vos publicités aux personnes les plus susceptibles d’échanger avec vous par message.'
            },
            {
                value: 'IMPRESSIONS',
                label: "Optimiser le nombre d'impressions",
                description: 'Nous essaierons de montrer vos publicités aux personnes autant de fois que possible.'
            }
        ]
    }
];

// À plat, pour retrouver facilement le label/description d'une valeur sélectionnée.
const TRAFFIC_PERFORMANCE_GOALS = TRAFFIC_PERFORMANCE_GOAL_GROUPS.flatMap(g => g.options);

// Valeur proposée par défaut, comme dans Ads Manager. Elle est écrite dans
// l'état du formulaire pour que l'affichage et l'envoi ne divergent jamais.
const TRAFFIC_DEFAULT_PERFORMANCE_GOAL = 'LANDING_PAGE_VIEWS';

// -------------------------------------------------------------------
// Debounce hook
// -------------------------------------------------------------------
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

// Extract just the origin (scheme + host + port) from VITE_API_URL.
// Works whether it is 'http://localhost:5000' or 'http://localhost:5000/api'.
const RAW_BASE = import.meta.env.VITE_API_URL || '';
let API_BASE = '';
try {
    API_BASE = RAW_BASE ? new URL(RAW_BASE).origin : '';
} catch {
    API_BASE = RAW_BASE.replace(/\/api\/?$/, '');
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
const AdSetForm = ({ campaignData, setCampaignData, user, onNext, onPrev }) => {
    // -------------------------------------------------------------------
    // Performance goal dropdown state (Trafic)
    // -------------------------------------------------------------------
    const [showGoalDropdown, setShowGoalDropdown] = useState(false);

    // -------------------------------------------------------------------
    // Location autocomplete state
    // -------------------------------------------------------------------
    const [locationSearch, setLocationSearch] = useState('');
    const [locationSuggestions, setLocationSuggestions] = useState([]);
    const [loadingLocations, setLoadingLocations] = useState(false);

    // -------------------------------------------------------------------
    // Interest autocomplete state
    // -------------------------------------------------------------------
    const [interestInput, setInterestInput] = useState('');
    const [interestSuggestions, setInterestSuggestions] = useState([]);
    const [loadingInterests, setLoadingInterests] = useState(false);

    const debouncedLocationSearch = useDebounce(locationSearch, 500);
    const debouncedInterestSearch = useDebounce(interestInput, 500);

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

    // Le sélecteur d'objectif de performance affiche LANDING_PAGE_VIEWS par
    // défaut ; on l'inscrit dans l'état, sinon le backend retombe sur
    // LINK_CLICKS et la campagne serait optimisée autrement que ce qui est
    // affiché à l'utilisateur.
    useEffect(() => {
        if (objective === 'LINK_CLICKS' && !campaignData.optimization_goal) {
            updateField('optimization_goal', TRAFFIC_DEFAULT_PERFORMANCE_GOAL);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objective, campaignData.optimization_goal]);

    // -------------------------------------------------------------------
    // Location API search
    // -------------------------------------------------------------------
    useEffect(() => {
        if (debouncedLocationSearch.length < 2) {
            setLocationSuggestions([]);
            return;
        }
        const searchLocations = async () => {
            setLoadingLocations(true);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(
                    `${API_BASE}/api/facebook/targeting/locations?q=${encodeURIComponent(debouncedLocationSearch)}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                const data = await response.json();
                setLocationSuggestions(data.suggestions || []);
            } catch (err) {
                console.error('Location search error:', err);
                setLocationSuggestions([]);
            } finally {
                setLoadingLocations(false);
            }
        };
        searchLocations();
    }, [debouncedLocationSearch]);

    // -------------------------------------------------------------------
    // Interest API search
    // -------------------------------------------------------------------
    useEffect(() => {
        if (debouncedInterestSearch.length < 2) {
            setInterestSuggestions([]);
            return;
        }
        const searchInterests = async () => {
            setLoadingInterests(true);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(
                    `${API_BASE}/api/facebook/targeting/interests?q=${encodeURIComponent(debouncedInterestSearch)}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                const data = await response.json();
                setInterestSuggestions(data.suggestions || []);
            } catch (err) {
                console.error('Interest search error:', err);
                setInterestSuggestions([]);
            } finally {
                setLoadingInterests(false);
            }
        };
        searchInterests();
    }, [debouncedInterestSearch]);

    // -------------------------------------------------------------------
    // Location management — stores objects {key, name, type, country_code}
    // -------------------------------------------------------------------
    const addLocation = (locSuggestion) => {
        const newLoc = {
            key: locSuggestion.key,
            name: locSuggestion.name,
            type: locSuggestion.type,
            country_code: locSuggestion.country_code
        };
        if (!targeting.locations.find(l => l.key === newLoc.key)) {
            updateTargeting('locations', [...targeting.locations, newLoc]);
        }
        setLocationSearch('');
        setLocationSuggestions([]);
    };

    const removeLocation = (locationKey) => {
        updateTargeting('locations', targeting.locations.filter(l => l.key !== locationKey));
    };

    // -------------------------------------------------------------------
    // Interest management — stores objects {id, name}
    // -------------------------------------------------------------------
    const addInterest = (interestSuggestion) => {
        const newInterest = {
            id: interestSuggestion.id,
            name: interestSuggestion.name
        };
        if (!targeting.interests.find(i => i.id === newInterest.id)) {
            updateTargeting('interests', [...targeting.interests, newInterest]);
        }
        setInterestInput('');
        setInterestSuggestions([]);
    };

    const removeInterest = (interestId) => {
        updateTargeting('interests', targeting.interests.filter(i => i.id !== interestId));
    };

    // -------------------------------------------------------------------
    // Audience estimation (simplified)
    // -------------------------------------------------------------------
    const audienceEstimate = useMemo(() => {
        let base = 500000;
        // Use location count for estimation; objects now
        const locCount = targeting.locations.length;
        base = locCount * 300000;
        if (locCount === 0) base = 500000;

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
        if (audienceEstimate.min < 10000) return 'Audience trop restreinte';
        if (audienceEstimate.min > 1000000) return 'Audience très large';
        return 'Taille optimale ✓';
    };

    const formatNumber = (n) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${Math.round(n / 1000)}K`;
        return n.toString();
    };

    const formatAudience = (n) => {
        if (!n) return null;
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
    const destType = campaignData.destination_type || 'WEBSITE';
    const isValid = targeting.locations.length > 0 &&
        targeting.age_min >= 18 &&
        targeting.age_max <= 65 &&
        daily_budget >= 1000 &&
        (destType !== 'WEBSITE' || (campaignData.website_url && campaignData.website_url.startsWith('http')));

    const rangePct = Math.round(((daily_budget - 1000) / (50000 - 1000)) * 100);

    return (
        <div>
            <h2 className="adset-page-title">
                Définissez votre audience et votre budget
            </h2>

            <div className="adset-grid">
                {/* LEFT — Form */}
                <div className="adset-left">

                    {objective === 'LINK_CLICKS' ? (
                        <>
                            {/* === NOM DE L'ENSEMBLE DE PUBLICITÉS (spécifique Trafic) === */}
                            <div className="adset-card">
                                <div className="adset-field-group">
                                    <label className="adset-label">Nom de l'ensemble de publicités</label>
                                    <input
                                        type="text"
                                        value={campaignData.adset_name || ''}
                                        onChange={(e) => updateField('adset_name', e.target.value)}
                                        placeholder="Nouvel ensemble de publicités de Trafic"
                                        className="adset-input"
                                    />
                                </div>
                            </div>

                            {/* === SECTION 0 (TRAFIC): CONVERSION === */}
                            <div className="adset-card">
                                <div className="adset-section-header">
                                    <div className="adset-section-icon audience">
                                        <Target size={22} />
                                    </div>
                                    <div>
                                        <h3 className="adset-section-title">Conversion</h3>
                                        <p className="adset-section-subtitle">Choisissez où vous voulez générer du trafic</p>
                                    </div>
                                </div>

                                <div className="adset-field-group">
                                    <label className="adset-label">Lieu de conversion <span className="required">*</span></label>
                                    <div className="adset-destination-group">
                                        {[
                                            { value: 'WEBSITE', label: 'Site Web', icon: '🌐', desc: 'Envoyez le trafic vers votre site Web', disabled: false },
                                            { value: 'APP', label: 'Application', icon: '📲', desc: 'Envoyez le trafic vers votre application', disabled: true },
                                            { value: 'MESSENGER', label: 'Applications de messagerie', icon: '💬', desc: 'Envoyez le trafic vers Messenger ou WhatsApp', disabled: false },
                                            { value: 'INSTAGRAM_PROFILE', label: 'Instagram ou Facebook', icon: '📷', desc: 'Envoyez le trafic vers un profil Instagram ou une Page Facebook', disabled: false },
                                            { value: 'PHONE_CALL', label: 'Appels', icon: '📞', desc: 'Incitez les personnes à appeler votre entreprise', disabled: true },
                                            { value: 'WEBSITE_AND_PHONE_CALL', label: 'Site Web et appels', icon: '🌐📞', desc: 'Redirigez vers votre site et incitez aux appels', disabled: true }
                                        ].map(opt => {
                                            const isSelected = (campaignData.destination_type || 'WEBSITE') === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    disabled={opt.disabled}
                                                    title={opt.disabled ? 'Bientôt disponible' : undefined}
                                                    onClick={() => updateField('destination_type', opt.value)}
                                                    className={`adset-destination-btn ${isSelected ? 'active' : ''}`}
                                                    style={opt.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                                >
                                                    <span className="dest-icon">{opt.icon}</span>
                                                    <div className="dest-content">
                                                        <span className="dest-label">{opt.label}{opt.disabled ? ' (bientôt)' : ''}</span>
                                                        <span className="dest-desc">{opt.desc}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {(campaignData.destination_type === 'WEBSITE' || !campaignData.destination_type) && (
                                    <div className="adset-field-group">
                                        <label className="adset-label">
                                            URL du site web <span className="required">*</span>
                                        </label>
                                        <input
                                            type="url"
                                            value={campaignData.website_url || ''}
                                            onChange={(e) => updateField('website_url', e.target.value)}
                                            placeholder="https://votre-site.com"
                                            className={`adset-input ${campaignData.website_url && !campaignData.website_url.startsWith('http') ? 'error' : ''}`}
                                        />
                                        <p className="adset-hint">💡 Les visiteurs seront redirigés vers cette URL</p>
                                    </div>
                                )}

                                <div className="adset-field-group adset-relative">
                                    <label className="adset-label">Objectif de performance</label>
                                    {(() => {
                                        const selectedGoal = TRAFFIC_PERFORMANCE_GOALS.find(
                                            opt => opt.value === (campaignData.optimization_goal || TRAFFIC_DEFAULT_PERFORMANCE_GOAL)
                                        );
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => setShowGoalDropdown(v => !v)}
                                                className="adset-input"
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    cursor: 'pointer',
                                                    background: '#fff',
                                                    textAlign: 'left'
                                                }}
                                            >
                                                <span>{selectedGoal?.label}</span>
                                                <span style={{ color: '#6B7280' }}>{showGoalDropdown ? '▲' : '▼'}</span>
                                            </button>
                                        );
                                    })()}

                                    {showGoalDropdown && (
                                        <div
                                            className="adset-dropdown"
                                            style={{ maxHeight: 360, overflowY: 'auto', padding: '10px 0' }}
                                        >
                                            {TRAFFIC_PERFORMANCE_GOAL_GROUPS.map(grp => (
                                                <div key={grp.group} style={{ marginBottom: 8 }}>
                                                    <p style={{ fontWeight: 700, fontSize: 14, margin: '4px 16px 6px' }}>{grp.group}</p>
                                                    {grp.options.map(opt => {
                                                        const isSelected = (campaignData.optimization_goal || TRAFFIC_DEFAULT_PERFORMANCE_GOAL) === opt.value;
                                                        return (
                                                            <label
                                                                key={opt.value}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'flex-start',
                                                                    gap: 10,
                                                                    padding: '8px 16px',
                                                                    cursor: 'pointer',
                                                                    backgroundColor: isSelected ? '#EAF3FF' : 'transparent'
                                                                }}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name="optimization_goal"
                                                                    value={opt.value}
                                                                    checked={isSelected}
                                                                    onChange={() => {
                                                                        updateField('optimization_goal', opt.value);
                                                                        setShowGoalDropdown(false);
                                                                    }}
                                                                    style={{ marginTop: 3 }}
                                                                />
                                                                <span>
                                                                    <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{opt.label}</span>
                                                                    <span style={{ display: 'block', fontSize: 13, color: '#6B7280' }}>{opt.description}</span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="adset-field-group">
                                    <label className="adset-label">
                                        Objectif de coût par résultat <span className="optional">(optionnel)</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={campaignData.cost_per_result_goal || ''}
                                        onChange={(e) => updateField('cost_per_result_goal', e.target.value)}
                                        placeholder="FCFA"
                                        className="adset-input"
                                    />
                                    <CurrencyHint amount={campaignData.cost_per_result_goal} suffix=" par résultat" />
                                    <p className="adset-hint">💡 Laissez vide pour le coût le plus bas sans plafond</p>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* === SECTION 0: DESTINATION (autres objectifs) === */
                        <div className="adset-card">
                            <div className="adset-section-header">
                                <div className="adset-section-icon audience">
                                    <Target size={22} />
                                </div>
                                <div>
                                    <h3 className="adset-section-title">Destination du trafic</h3>
                                    <p className="adset-section-subtitle">Où voulez-vous envoyer les visiteurs ?</p>
                                </div>
                            </div>

                            <div className="adset-field-group">
                                <label className="adset-label">Type de destination <span className="required">*</span></label>
                                <div className="adset-destination-group">
                                    {[
                                        { value: 'WEBSITE', label: 'Site web', icon: '🌐', desc: 'Rediriger vers votre site' },
                                        { value: 'MESSENGER', label: 'Messenger', icon: '💬', desc: 'Discuter via Messenger' },
                                        { value: 'WHATSAPP', label: 'WhatsApp', icon: '📱', desc: 'Contacter via WhatsApp' },
                                        { value: 'INSTAGRAM_PROFILE', label: 'Instagram', icon: '📷', desc: 'Visiter votre Instagram' }
                                    ].map(opt => {
                                        const isSelected = (campaignData.destination_type || 'WEBSITE') === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => updateField('destination_type', opt.value)}
                                                className={`adset-destination-btn ${isSelected ? 'active' : ''}`}
                                            >
                                                <span className="dest-icon">{opt.icon}</span>
                                                <div className="dest-content">
                                                    <span className="dest-label">{opt.label}</span>
                                                    <span className="dest-desc">{opt.desc}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {(campaignData.destination_type === 'WEBSITE' || !campaignData.destination_type) && (
                                <div className="adset-field-group">
                                    <label className="adset-label">
                                        URL du site web <span className="required">*</span>
                                    </label>
                                    <input
                                        type="url"
                                        value={campaignData.website_url || ''}
                                        onChange={(e) => updateField('website_url', e.target.value)}
                                        placeholder="https://votre-site.com"
                                        className={`adset-input ${campaignData.website_url && !campaignData.website_url.startsWith('http') ? 'error' : ''}`}
                                    />
                                    <p className="adset-hint">💡 Les visiteurs seront redirigés vers cette URL</p>
                                </div>
                            )}
                        </div>
                    )}

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
                                    onChange={(e) => setLocationSearch(e.target.value)}
                                    placeholder="🔍 Rechercher une ville ou un pays..."
                                    className="adset-input"
                                    autoComplete="off"
                                />
                                {loadingLocations && (
                                    <div className="adset-dropdown-loading">🔍 Recherche...</div>
                                )}
                                {!loadingLocations && locationSuggestions.length > 0 && (
                                    <div className="adset-dropdown">
                                        {locationSuggestions.map(loc => (
                                            <button
                                                key={loc.key}
                                                onClick={() => addLocation(loc)}
                                                className="adset-dropdown-item"
                                            >
                                                <MapPin size={15} />
                                                <div>
                                                    <div>{loc.name}</div>
                                                    <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                                        {loc.type} · {loc.country_name || loc.country_code}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {targeting.locations.length > 0 && (
                                <div className="adset-tags-row">
                                    {targeting.locations.map(loc => (
                                        <span key={loc.key} className="adset-tag location">
                                            <MapPin size={14} />
                                            {loc.name}
                                            <button onClick={() => removeLocation(loc.key)} className="adset-tag-remove">
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

                        {/* 4. Intérêts */}
                        <div className="adset-field-group">
                            <label className="adset-label">
                                Centres d'intérêt <span className="optional">(optionnel)</span>
                            </label>
                            <div className="adset-relative">
                                <div className="adset-interest-row">
                                    <input
                                        type="text"
                                        value={interestInput}
                                        onChange={(e) => setInterestInput(e.target.value)}
                                        placeholder="🔍 Rechercher un intérêt (ex: Mode, Football)..."
                                        className="adset-input"
                                        style={{ flex: 1 }}
                                        autoComplete="off"
                                    />
                                </div>
                                {loadingInterests && (
                                    <div className="adset-dropdown-loading">🔍 Recherche...</div>
                                )}
                                {!loadingInterests && interestSuggestions.length > 0 && (
                                    <div className="adset-dropdown" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        {interestSuggestions.map(interest => (
                                            <button
                                                key={interest.id}
                                                onClick={() => addInterest(interest)}
                                                className="adset-dropdown-item"
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div>{interest.name}</div>
                                                    {interest.audience_size_lower_bound && (
                                                        <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                                            ~{formatAudience(interest.audience_size_lower_bound)} – {formatAudience(interest.audience_size_upper_bound)} personnes
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Selected interests */}
                            {targeting.interests.length > 0 && (
                                <div className="adset-tags-row" style={{ marginTop: 14 }}>
                                    {targeting.interests.map(interest => (
                                        <span key={interest.id} className="adset-tag interest">
                                            {interest.name}
                                            <button onClick={() => removeInterest(interest.id)} className="adset-tag-remove">
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
                                city={targeting.locations[0]?.name || 'Douala'}
                                budget={daily_budget}
                                onApplyStrategy={(strategy) => {
                                    setCampaignData(prev => ({
                                        ...prev,
                                        targeting: {
                                            ...prev.targeting,
                                            age_min: strategy.age_min || prev.targeting.age_min,
                                            age_max: strategy.age_max || prev.targeting.age_max,
                                            genders: strategy.gender === 'all' ? [] : (strategy.gender ? [strategy.gender] : prev.targeting.genders),
                                            interests: prev.targeting.interests, // keep API-sourced interests
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

                            <CurrencyHint
                                amount={daily_budget}
                                suffix={budget_type === 'daily' ? ' / jour' : ' au total'}
                            />

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

                        {/* Optimization — pour Trafic, ces réglages sont déjà dans la carte "Conversion" plus haut */}
                        {objective !== 'LINK_CLICKS' && (
                            <div className="adset-field-group">
                                <label className="adset-label">Optimisation de la diffusion</label>
                                <div className="adset-opt-pill">
                                    <Sparkles size={16} className="opt-icon" />
                                    <span className="opt-text">
                                        {OPTIMIZATION_LABELS[objective] || 'Portée maximale'}
                                    </span>
                                </div>
                            </div>
                        )}

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
                                        {targeting.locations.length > 0
                                            ? targeting.locations.map(l => l.name).join(', ')
                                            : '—'}
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
