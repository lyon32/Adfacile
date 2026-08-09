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
    X, Plus, Info, Users, Target
} from 'lucide-react';
import AITargetingHelper from '../ai/AITargetingHelper';
import CurrencyHint from './CurrencyHint';
import MessagingDestinationPicker from './MessagingDestinationPicker';
import api from '../../services/api';
import '../../styles/adset-form.css';

/**
 * Libellés de tous les objectifs de performance, quel que soit l'objectif de
 * campagne. Ce dictionnaire ne décide de rien : ce sont les valeurs servies par
 * /api/config/objectives qui déterminent lesquels sont proposés. Il ne fait que
 * les nommer en français courant plutôt qu'en jargon publicitaire.
 */
const LIBELLES_GOALS = {
    LINK_CLICKS: {
        label: 'Obtenir un maximum de clics',
        description: 'Vos publicités iront vers les personnes les plus enclines à cliquer.'
    },
    LANDING_PAGE_VIEWS: {
        label: 'Obtenir un maximum de visites',
        description: 'Vos publicités iront vers les personnes qui chargeront vraiment votre page, pas seulement celles qui cliquent.'
    },
    REACH: {
        label: 'Toucher le plus de personnes différentes',
        description: 'Chaque personne verra votre publicité environ une fois par jour.'
    },
    IMPRESSIONS: {
        label: 'Être vu le plus souvent possible',
        description: 'Vos publicités seront montrées autant de fois que le budget le permet, même aux mêmes personnes.'
    },
    CONVERSATIONS: {
        label: 'Obtenir un maximum de conversations',
        description: 'Vos publicités iront vers les personnes les plus enclines à vous écrire.'
    },
    POST_ENGAGEMENT: {
        label: 'Obtenir des réactions et des commentaires',
        description: 'Vos publicités iront vers les personnes les plus enclines à interagir avec votre publication.'
    },
    THRUPLAY: {
        label: 'Faire regarder votre vidéo en entier',
        description: 'Vos publicités iront vers les personnes qui regardent les vidéos jusqu’au bout.'
    },
    AD_RECALL_LIFT: {
        label: 'Marquer les esprits',
        description: 'Vos publicités iront vers les personnes les plus susceptibles de se souvenir de vous.'
    },
    QUALITY_CALL: {
        label: 'Recevoir des appels utiles',
        description: 'Vos publicités iront vers les personnes les plus enclines à vous appeler pour de bon.'
    },
    LEAD_GENERATION: {
        label: 'Recueillir des coordonnées',
        description: 'Vos publicités iront vers les personnes les plus enclines à laisser leurs coordonnées.'
    },
    OFFSITE_CONVERSIONS: {
        label: 'Obtenir des achats sur votre site',
        description: 'Vos publicités iront vers les personnes les plus enclines à acheter. Nécessite un pixel installé sur votre site.'
    }
};

const decrireGoal = (valeur) => LIBELLES_GOALS[valeur] || { label: valeur, description: '' };

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

    // Destinations de messagerie : MESSENGER sert de repère d'interface pour
    // « Applications de messagerie » ; c'est messaging_destinations qui décide
    // réellement de la destination envoyée à Facebook.
    const MESSAGING_UI_VALUE = 'MESSENGER';

    const selectionnerDestination = (value) => {
        setCampaignData(prev => ({
            ...prev,
            destination_type: value,
            messaging_destinations: value === MESSAGING_UI_VALUE
                ? (prev.messaging_destinations?.length ? prev.messaging_destinations : ['messenger'])
                : []
        }));
    };

    // ───────────────────────────────────────────────────────────────────
    // Référentiel des objectifs — servi par le backend
    //
    // Le formulaire n'entretient plus sa propre liste : il lit celle que le
    // backend applique. C'est ce qui empêche de proposer une combinaison que
    // la création rejettera ensuite.
    // ───────────────────────────────────────────────────────────────────
    const [tousObjectifs, setTousObjectifs] = useState(null);
    const [typesMessagerie, setTypesMessagerie] = useState({});

    useEffect(() => {
        let annule = false;
        api.get('/config/objectives')
            .then(res => {
                if (annule) return;
                setTousObjectifs(res.data?.data?.objectives || []);
                setTypesMessagerie(res.data?.data?.messaging_destination_types || {});
            })
            .catch(() => { if (!annule) setTousObjectifs([]); });
        return () => { annule = true; };
    }, []);

    // Minimum de budget : le formulaire imposait 1000 FCFA en dur alors que le
    // backend applique minDailyBudgetFcfa(), calcule depuis le taux de change.
    // Les deux pouvaient diverger sans que rien ne le signale.
    const [minBudget, setMinBudget] = useState(1000);

    useEffect(() => {
        let annule = false;
        api.get('/config/currency')
            .then(res => {
                const v = res.data?.data?.min_daily_budget_xaf;
                if (!annule && v) setMinBudget(v);
            })
            .catch(() => { });
        return () => { annule = true; };
    }, []);

    // Le champ de budget ecrivait toujours dans daily_budget : choisir « Total »
    // ne changeait que l'etiquette, et le service recevait un budget total egal
    // au budget journalier saisi.
    const champBudget = budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
    const montantBudget = campaignData[champBudget] ?? daily_budget ?? minBudget;
    const definirBudget = (valeur) => updateField(champBudget, valeur);

    const referentiel = useMemo(
        () => (tousObjectifs || []).find(o => o.value === objective) || null,
        [tousObjectifs, objective]
    );

    /**
     * Destinations que le référentiel autorise pour l'objectif choisi.
     *
     * La liste affichée était figée : elle proposait les mêmes six choix quel
     * que soit l'objectif. Une campagne Ventes laissait ainsi choisir
     * « Appels », qui ne propose aucun objectif de performance — l'étape se
     * bloquait sans expliquer pourquoi.
     */
    const destinationsValides = useMemo(() => {
        if (!referentiel) return null;
        return new Set(Object.values(referentiel.goals_by_destination || {}).flat());
    }, [referentiel]);

    /** Vrai si le bouton d'interface mène à une destination acceptée. */
    const destinationUtilisable = (valeur) => {
        if (!destinationsValides) return true;   // avant chargement, ne rien griser
        if (valeur === MESSAGING_UI_VALUE) {
            return ['MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT']
                .some(d => destinationsValides.has(d))
                || [...destinationsValides].some(d => d.startsWith('MESSAGING_'));
        }
        return destinationsValides.has(valeur);
    };

    /** Objectifs de performance acceptés pour l'objectif ET la destination. */
    const goalsDisponibles = useMemo(() => {
        if (!referentiel) return [];
        // La destination réellement envoyée à Meta dépend des applications
        // cochées, pas du bouton d'interface. Déduire « Messenger » de toute
        // sélection unique faisait proposer les objectifs de Messenger à une
        // campagne WhatsApp — l'écran affichait alors autre chose que ce qui
        // partait chez Meta.
        const apps = [...(campaignData.messaging_destinations || [])].sort();
        const dest = campaignData.destination_type === MESSAGING_UI_VALUE
            ? (typesMessagerie[apps.join('+')] || 'MESSENGER')
            : (campaignData.destination_type || 'WEBSITE');

        return Object.entries(referentiel.goals_by_destination || {})
            .filter(([, destinations]) => destinations.includes(dest))
            .map(([goal]) => goal);
    }, [referentiel, typesMessagerie, campaignData.destination_type, campaignData.messaging_destinations]);

    useEffect(() => {
        // L'objectif de performance par défaut dépend de l'objectif de campagne
        // ET de la destination : Ventes vers un site web n'accepte pas ce que
        // Ventes par messagerie accepte. Le référentiel serveur tranche.
        if (!objective || !referentiel) return;

        const acceptables = goalsDisponibles;
        if (acceptables.length === 0) return;

        if (!campaignData.optimization_goal || !acceptables.includes(campaignData.optimization_goal)) {
            const defaut = acceptables.includes(referentiel.default_goal)
                ? referentiel.default_goal
                : acceptables[0];
            updateField('optimization_goal', defaut);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objective, referentiel, goalsDisponibles, campaignData.optimization_goal]);

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
        montantBudget >= minBudget &&
        (budget_type !== 'lifetime' || !!end_date) &&
        (destType !== 'WEBSITE' || (campaignData.website_url && campaignData.website_url.startsWith('http'))) &&
        // Un ensemble de publicités de messagerie sans application cochée est
        // refusé par Facebook : on l'interdit dès le formulaire.
        (destType !== 'MESSENGER' || (campaignData.messaging_destinations?.length > 0)) &&
        // WhatsApp coché sans numéro produit une publicité sans destinataire :
        // Facebook l'accepte, mais elle ne peut pas être diffusée.
        (!campaignData.messaging_destinations?.includes('whatsapp')
            || /^\d+$/.test((campaignData.whatsapp_phone_number_id || '').trim()));

    const rangePct = Math.round(((daily_budget - 1000) / (50000 - 1000)) * 100);

    return (
        <div>
            <h2 className="adset-page-title">
                Définissez votre audience et votre budget
            </h2>

            <div className="adset-grid">
                {/* LEFT — Form */}
                <div className="adset-left">

                    {/* La carte Conversion est désormais commune à tous les
                     * objectifs. Elle n'existait que pour Trafic : les cinq
                     * autres partageaient un bloc réduit, intitulé « Destination
                     * du trafic » même pour une campagne Notoriété, sans nom
                     * d'ensemble ni objectif de performance. */}
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
                                            { value: 'APP', label: 'Application', icon: '📲', desc: 'Envoyez le trafic vers votre application', disabled: true, raison: 'Requiert une application mobile déclarée dans votre compte Meta.' },
                                            { value: 'MESSENGER', label: 'Applications de messagerie', icon: '💬', desc: 'Ouvrez une conversation sur Messenger, Instagram ou WhatsApp', disabled: false },
                                            { value: 'INSTAGRAM_PROFILE', label: 'Instagram ou Facebook', icon: '📷', desc: 'Envoyez le trafic vers un profil Instagram ou une Page Facebook', disabled: false },
                                            { value: 'PHONE_CALL', label: 'Appels', icon: '📞', desc: 'Incitez les personnes à appeler votre entreprise', disabled: false },
                                            { value: 'WEBSITE_AND_PHONE_CALL', label: 'Site Web et appels', icon: '🌐📞', desc: 'Redirigez vers votre site et incitez aux appels', disabled: true, raison: 'Pas encore pris en charge par AdsFacile.' }
                                        ].map(opt => {
                                            const isSelected = (campaignData.destination_type || 'WEBSITE') === opt.value;
                                            // Une destination est proposée si le référentiel
                                            // l'accepte pour cet objectif. Plus de liste figée.
                                            const indispo = opt.disabled || !destinationUtilisable(opt.value);
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    disabled={indispo}
                                                    title={indispo
                                                        ? (opt.disabled
                                                            ? opt.raison
                                                            : `Non disponible pour l'objectif ${referentiel?.label || ''}`)
                                                        : undefined}
                                                    onClick={() => selectionnerDestination(opt.value)}
                                                    className={`adset-destination-btn ${isSelected ? 'active' : ''}`}
                                                    style={indispo ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
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

                                {campaignData.destination_type === MESSAGING_UI_VALUE && (
                                    <MessagingDestinationPicker
                                        selected={campaignData.messaging_destinations || ['messenger']}
                                        onChange={(apps) => updateField('messaging_destinations', apps)}
                                        whatsappNumberId={campaignData.whatsapp_phone_number_id || ''}
                                        onWhatsappNumberIdChange={(v) => updateField('whatsapp_phone_number_id', v)}
                                    />
                                )}

                                <div className="adset-field-group adset-relative">
                                    <label className="adset-label">Objectif de performance</label>
                                    {(() => {
                                        const selectedGoal = decrireGoal(campaignData.optimization_goal);
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
                                            {[{ group: null, options: goalsDisponibles.map(v => ({ value: v, ...decrireGoal(v) })) }].map(grp => (
                                                <div key={grp.group || 'tous'} style={{ marginBottom: 8 }}>
                                                    {grp.options.length === 0 && (
                                                        <p style={{ fontSize: 13, margin: '4px 16px', color: 'var(--color-text-light)' }}>
                                                            Choisissez d’abord un lieu de conversion.
                                                        </p>
                                                    )}
                                                    {grp.options.map(opt => {
                                                        const isSelected = campaignData.optimization_goal === opt.value;
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
                                        value={montantBudget}
                                        onChange={(e) => definirBudget(
                                            Math.max(minBudget, parseInt(e.target.value) || minBudget)
                                        )}
                                        min={minBudget}
                                        step={500}
                                        className="adset-budget-input"
                                    />
                                    <span className="adset-budget-currency">FCFA</span>
                                </div>
                                <span className="adset-budget-per">/ {budget_type === 'daily' ? 'jour' : 'total'}</span>
                            </div>

                            <CurrencyHint
                                amount={montantBudget}
                                suffix={budget_type === 'daily' ? ' / jour' : ' au total'}
                            />

                            {/* Slider */}
                            <input
                                type="range"
                                min={minBudget}
                                max={50000}
                                step={500}
                                value={montantBudget}
                                onChange={(e) => definirBudget(parseInt(e.target.value))}
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
                            {budget_type === 'lifetime' && !end_date && (
                                <p className="messaging-app-missing" style={{ marginLeft: 0 }}>
                                    Un budget total demande une date de fin : Facebook a besoin de
                                    savoir sur combien de temps le répartir.
                                </p>
                            )}
                        </div>

                        {/* La pastille « Optimisation de la diffusion » a été retirée :
                            elle affichait un libellé sans jamais renseigner
                            optimization_goal, laissant croire à un réglage qui
                            n'était pas transmis. Le véritable sélecteur, dans la
                            carte Conversion, s'applique désormais à tous les
                            objectifs. */}

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
