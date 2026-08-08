/**
 * CreateCampaignPage — Wizard de création de campagne
 * AdsFacile Frontend
 * 
 * 3 étapes : Objectif → Audience & Budget → Creative
 * Flow Facebook Ads Manager complet
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, Loader2, Target, Users as UsersIcon, Palette, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import CampaignObjectiveSelector from '../components/campaigns/CampaignObjectiveSelector';
import AdSetForm from '../components/campaigns/AdSetForm';
import AdCreativeForm from '../components/campaigns/AdCreativeForm';
import { useCampaigns } from '../hooks/useCampaigns';

const STEPS = [
    { id: 1, label: 'Objectif', icon: Target },
    { id: 2, label: 'Audience & Budget', icon: UsersIcon },
    { id: 3, label: 'Creative', icon: Palette }
];

const CreateCampaignPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { createCampaign } = useCampaigns();

    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [createdCampaign, setCreatedCampaign] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorDetails, setErrorDetails] = useState(null);

    const [campaignData, setCampaignData] = useState({
        // Niveau Campaign
        objective: '',
        campaign_name: '',

        // Niveau Ad Set
        adset_name: '',
        targeting: {
            locations: [],
            age_min: 18,
            age_max: 65,
            genders: [],
            interests: [],
            behaviors: []
        },
        budget_type: 'daily',
        daily_budget: 5000,
        start_date: new Date(),
        end_date: null,
        optimization_goal: '',
        cost_per_result_goal: '',
        destination_type: 'WEBSITE',
        website_url: '',

        // Niveau Ad
        ad_name: '',
        creative: {
            message: '',
            headline: '',
            description: '',
            call_to_action: 'LEARN_MORE',
            media_type: 'image',
            media_url: '',
            media_hash: '',
            link: '',
            display_link: ''
        }
    });

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setErrorMessage('');
        setErrorDetails(null);

        try {
            const result = await createCampaign(campaignData);
            setCreatedCampaign(result);
            setShowSuccessModal(true);
        } catch (err) {
            setErrorMessage(err.message || 'Erreur lors de la création de la campagne');
            setErrorDetails(err.details || null);
            setShowErrorModal(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DashboardLayout title="Nouvelle campagne">
            <div className="max-w-5xl mx-auto">
                {/* Back button */}
                <button
                    onClick={() => navigate('/campaigns')}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
                >
                    <ArrowLeft size={16} />
                    Retour aux campagnes
                </button>

                {/* Progress Indicator */}
                <div className="mb-8">
                    <div className="flex items-center justify-between max-w-lg mx-auto">
                        {STEPS.map((s, idx) => {
                            const Icon = s.icon;
                            const isActive = step === s.id;
                            const isCompleted = step > s.id;

                            return (
                                <div key={s.id} className="flex items-center">
                                    {/* Step circle */}
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={`
                        w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                        ${isCompleted
                                                    ? 'bg-emerald-500 text-white'
                                                    : isActive
                                                        ? 'bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50'
                                                        : 'bg-gray-100 text-gray-400'
                                                }
                      `}
                                        >
                                            {isCompleted ? (
                                                <Check size={18} />
                                            ) : (
                                                <Icon size={18} />
                                            )}
                                        </div>
                                        <span className={`
                      mt-2 text-xs font-medium
                      ${isActive ? 'text-emerald-600' : isCompleted ? 'text-emerald-500' : 'text-gray-400'}
                    `}>
                                            {s.label}
                                        </span>
                                    </div>

                                    {/* Connector line */}
                                    {idx < STEPS.length - 1 && (
                                        <div className={`
                      w-16 sm:w-24 h-0.5 mx-2 mt-[-1rem] transition-colors duration-300
                      ${step > s.id ? 'bg-emerald-500' : 'bg-gray-200'}
                    `} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Step Content */}
                <div className="min-h-[60vh]">
                    {step === 1 && (
                        <CampaignObjectiveSelector
                            campaignData={campaignData}
                            setCampaignData={setCampaignData}
                            onNext={() => setStep(2)}
                        />
                    )}

                    {step === 2 && (
                        <AdSetForm
                            campaignData={campaignData}
                            setCampaignData={setCampaignData}
                            user={user}
                            onNext={() => setStep(3)}
                            onPrev={() => setStep(1)}
                        />
                    )}

                    {step === 3 && (
                        <AdCreativeForm
                            campaignData={campaignData}
                            setCampaignData={setCampaignData}
                            user={user}
                            onPrev={() => setStep(2)}
                            onSubmit={handleSubmit}
                            isSubmitting={isSubmitting}
                        />
                    )}
                </div>
            </div>

            {/* ═══════ SUCCESS MODAL ═══════ */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in">
                        {/* Confetti-like decoration */}
                        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                            {Array.from({ length: 20 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute w-2 h-2 rounded-full animate-bounce"
                                    style={{
                                        left: `${Math.random() * 100}%`,
                                        top: `${Math.random() * 40}%`,
                                        backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'][i % 5],
                                        animationDelay: `${Math.random() * 2}s`,
                                        animationDuration: `${1 + Math.random() * 2}s`,
                                        opacity: 0.6
                                    }}
                                />
                            ))}
                        </div>

                        <div className="relative z-10">
                            <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                                <Check size={40} className="text-emerald-500" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                Campagne créée ! 🎉
                            </h3>
                            <p className="text-gray-500 mb-4">
                                Votre campagne sera vérifiée par Facebook (1-24h)
                            </p>

                            {createdCampaign && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Campaign ID</span>
                                        <span className="font-mono text-gray-700 text-xs">
                                            {createdCampaign.fb_campaign_id || '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Statut</span>
                                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                            En pause
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    onClick={() => navigate('/campaigns')}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold transition-colors"
                                >
                                    Voir ma campagne
                                </button>
                                <button
                                    onClick={() => {
                                        setShowSuccessModal(false);
                                        setStep(1);
                                        setCampaignData({
                                            objective: '',
                                            campaign_name: '',
                                            adset_name: '',
                                            targeting: { locations: [], age_min: 18, age_max: 65, genders: [], interests: [], behaviors: [] },
                                            budget_type: 'daily',
                                            daily_budget: 5000,
                                            start_date: new Date(),
                                            end_date: null,
                                            optimization_goal: '',
                                            cost_per_result_goal: '',
                                            destination_type: 'WEBSITE',
                                            website_url: '',
                                            ad_name: '',
                                            creative: {
                                                message: '', headline: '', description: '',
                                                call_to_action: 'LEARN_MORE', media_type: 'image',
                                                media_url: '', media_hash: '', link: '', display_link: ''
                                            }
                                        });
                                    }}
                                    className="w-full py-3 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                                >
                                    Créer une autre campagne
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ ERROR MODAL ═══════ */}
            {showErrorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowErrorModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
                        <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle size={32} className="text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                            Erreur lors de la création
                        </h3>
                        <p className="text-gray-500 mb-4">{errorMessage}</p>

                        {errorDetails && (
                            <div className="bg-red-50 rounded-lg p-3 mb-4 text-left">
                                <p className="text-xs font-medium text-red-700 mb-1">Détails :</p>
                                {Array.isArray(errorDetails) ? (
                                    <ul className="text-xs text-red-600 space-y-1">
                                        {errorDetails.map((d, i) => <li key={i}>• {d}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-red-600">{JSON.stringify(errorDetails)}</p>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowErrorModal(false);
                                    handleSubmit();
                                }}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold transition-colors"
                            >
                                Réessayer
                            </button>
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                Retour
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default CreateCampaignPage;
