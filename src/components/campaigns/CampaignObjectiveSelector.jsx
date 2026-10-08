/**
 * CampaignObjectiveSelector — Étape 1 du wizard
 * Sélection de l'objectif marketing (6 objectifs Facebook)
 */

import { useState, useEffect } from 'react';
import { Eye, MousePointer, Heart, Users, Smartphone, ShoppingCart, ChevronRight, Lock, Info } from 'lucide-react';
import api from '../../services/api';

/**
 * Icônes, dans l'ordre d'affichage. Le reste — libellé, description,
 * disponibilité — vient de /api/config/objectives, pour que le formulaire et
 * le backend lisent la même table. Entretenir une seconde liste ici, c'est
 * garantir qu'elles divergeront.
 */
const ICONES = {
    OUTCOME_AWARENESS: Eye,
    OUTCOME_TRAFFIC: MousePointer,
    OUTCOME_ENGAGEMENT: Heart,
    OUTCOME_LEADS: Users,
    OUTCOME_APP_PROMOTION: Smartphone,
    OUTCOME_SALES: ShoppingCart
};

const ORDRE = [
    'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT',
    'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION'
];

const CampaignObjectiveSelector = ({ campaignData, setCampaignData, onNext }) => {
    const selectedObjective = campaignData.objective;
    const campaignName = campaignData.campaign_name;

    const [objectifs, setObjectifs] = useState([]);
    const [chargement, setChargement] = useState(true);

    useEffect(() => {
        let annule = false;
        api.get('/config/objectives')
            .then(res => {
                if (annule) return;
                const liste = res.data?.data?.objectives || [];
                setObjectifs(
                    [...liste].sort((a, b) => ORDRE.indexOf(a.value) - ORDRE.indexOf(b.value))
                );
            })
            .catch(() => { if (!annule) setObjectifs([]); })
            .finally(() => { if (!annule) setChargement(false); });
        return () => { annule = true; };
    }, []);

    /**
     * Change l'objectif ET remet à zéro tout ce qui en dépend.
     *
     * Sans cette remise à zéro, choisir Trafic (qui inscrit
     * LANDING_PAGE_VIEWS) puis revenir choisir Notoriété laissait cet objectif
     * de performance en place — Meta le refuse pour Notoriété, mais seulement
     * après avoir créé la campagne.
     */
    const selectObjective = (objectiveId) => {
        setCampaignData(prev => ({
            ...prev,
            objective: objectiveId,
            optimization_goal: '',
            destination_type: 'WEBSITE',
            messaging_destinations: [],
            cost_per_result_goal: ''
        }));
    };

    const updateName = (name) => {
        if (name.length <= 255) {
            setCampaignData(prev => ({ ...prev, campaign_name: name }));
        }
    };

    const isValid = selectedObjective && campaignName.length > 0;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900">
                    Choisissez un objectif de campagne
                </h2>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed max-w-2xl">
                    Ce que vous voulez obtenir de vos publicités. Ce choix détermine
                    les réglages proposés aux étapes suivantes.
                </p>
            </div>

            {/* Objectives Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {chargement && [0, 1, 2, 3].map(i => (
                    <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
                ))}

                {!chargement && objectifs.map((obj) => {
                    const Icon = ICONES[obj.value] || MousePointer;
                    const isSelected = selectedObjective === obj.value;
                    const indisponible = !obj.available;

                    return (
                        <button
                            key={obj.value}
                            type="button"
                            disabled={indisponible}
                            onClick={() => selectObjective(obj.value)}
                            aria-pressed={isSelected}
                            className={`
                relative flex items-start gap-4 p-5 rounded-xl text-left transition-all duration-200
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500
                ${indisponible
                                    ? 'bg-gray-50 border border-gray-200 cursor-not-allowed'
                                    : isSelected
                                        ? 'bg-emerald-50 border-2 border-emerald-500 shadow-md shadow-emerald-100'
                                        : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm'
                                }
              `}
                        >
                            {/* Checkmark when selected */}
                            {isSelected && (
                                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            )}
                            {indisponible && (
                                <div className="absolute top-3 right-3 text-gray-400">
                                    <Lock size={16} />
                                </div>
                            )}

                            {/* Icon */}
                            <div className={`
                flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center
                ${indisponible
                                    ? 'bg-gray-100 text-gray-400'
                                    : isSelected ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}
              `}>
                                <Icon size={24} />
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <h3 className={`font-semibold ${indisponible ? 'text-gray-500'
                                    : isSelected ? 'text-emerald-700' : 'text-gray-900'}`}>
                                    {obj.label}
                                </h3>
                                <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                                    {obj.description}
                                </p>
                                {/* Meta refuse d'optimiser les achats sans pixel : on le dit
                                    dès le choix de l'objectif, pas à la dernière étape. Pastille
                                    non interactive — la carte entière est déjà un bouton. */}
                                {!indisponible && obj.needs_dataset && (
                                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                                        <Info size={12} aria-hidden="true" />
                                        Configuration de conversion requise
                                    </p>
                                )}
                                {!indisponible && obj.needs_dataset && (
                                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                                        Un pixel (ensemble de données) est nécessaire pour optimiser les achats.
                                        Sans pixel, choisissez Trafic.
                                    </p>
                                )}
                                {/* Un objectif indisponible dit pourquoi, plutôt qu'un
                                    « bientôt » qui laisse l'utilisateur sans recours. */}
                                {indisponible && obj.unavailable_reason && (
                                    <p className="mt-2 text-xs text-amber-700 leading-relaxed">
                                        {obj.unavailable_reason}
                                    </p>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Campaign Name */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de la campagne
                </label>
                <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => updateName(e.target.value)}
                    placeholder="Ex: Promo Mars 2026"
                    maxLength={255}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-colors text-gray-900 placeholder-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400 text-right">{campaignName.length}/255</p>
            </div>

            {/* Next Button */}
            <div className="flex justify-end pt-4">
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

export default CampaignObjectiveSelector;
