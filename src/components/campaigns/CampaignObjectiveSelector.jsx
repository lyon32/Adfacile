/**
 * CampaignObjectiveSelector — Étape 1 du wizard
 * Sélection de l'objectif marketing (6 objectifs Facebook)
 */

import { useState } from 'react';
import { Eye, MousePointer, Heart, Users, Smartphone, ShoppingCart, ChevronRight } from 'lucide-react';

const OBJECTIVES = [
    {
        id: 'OUTCOME_AWARENESS',
        icon: Eye,
        title: 'Awareness',
        subtitle: 'Notoriété',
        description: 'Touchez un maximum de personnes et augmentez la notoriété de votre marque'
    },
    {
        id: 'OUTCOME_TRAFFIC',
        icon: MousePointer,
        title: 'Traffic',
        subtitle: 'Trafic',
        description: 'Envoyez des gens vers votre site web, application ou événement'
    },
    {
        id: 'OUTCOME_ENGAGEMENT',
        icon: Heart,
        title: 'Engagement',
        subtitle: 'Engagement',
        description: "Obtenez plus de j'aime, commentaires, partages ou vues"
    },
    {
        id: 'OUTCOME_LEADS',
        icon: Users,
        title: 'Leads',
        subtitle: 'Prospects',
        description: 'Collectez des prospects pour votre entreprise'
    },
    {
        id: 'OUTCOME_APP_PROMOTION',
        icon: Smartphone,
        title: 'App promotion',
        subtitle: 'Application',
        description: "Générez plus d'installations dans votre application"
    },
    {
        id: 'OUTCOME_SALES',
        icon: ShoppingCart,
        title: 'Sales',
        subtitle: 'Ventes',
        description: 'Trouvez des personnes susceptibles d\'acheter votre produit'
    }
];

const CampaignObjectiveSelector = ({ campaignData, setCampaignData, onNext }) => {
    const selectedObjective = campaignData.objective;
    const campaignName = campaignData.campaign_name;

    const selectObjective = (objectiveId) => {
        setCampaignData(prev => ({ ...prev, objective: objectiveId }));
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
                    L'objectif de votre campagne est le but commercial que vous souhaitez atteindre
                    avec vos publicités. Survolez chaque option pour plus d'informations.
                </p>
            </div>

            {/* Objectives Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {OBJECTIVES.map((obj) => {
                    const Icon = obj.icon;
                    const isSelected = selectedObjective === obj.id;

                    return (
                        <button
                            key={obj.id}
                            onClick={() => selectObjective(obj.id)}
                            className={`
                relative flex items-start gap-4 p-5 rounded-xl text-left transition-all duration-200
                ${isSelected
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

                            {/* Icon */}
                            <div className={`
                flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center
                ${isSelected ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}
              `}>
                                <Icon size={24} />
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className={`font-semibold ${isSelected ? 'text-emerald-700' : 'text-gray-900'}`}>
                                        {obj.title}
                                    </h3>
                                    <span className="text-xs text-gray-400">({obj.subtitle})</span>
                                </div>
                                <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                                    {obj.description}
                                </p>
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
