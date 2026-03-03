/**
 * CampaignsListPage — Liste des campagnes
 * AdsFacile Frontend
 * 
 * Affiche les campagnes avec filtres, empty state, et modal limite plan
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Plus, Target, Filter, Loader2, AlertTriangle,
    X, ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import CampaignCard from '../components/campaigns/CampaignCard';
import { useCampaigns } from '../hooks/useCampaigns';

const FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'active', label: 'Actives' },
    { value: 'paused', label: 'En pause' },
    { value: 'completed', label: 'Terminées' }
];

const CampaignsListPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { campaigns, loading, error, meta, fetchCampaigns, updateStatus, deleteCampaign } = useCampaigns();
    const [activeFilter, setActiveFilter] = useState('all');
    const [showLimitModal, setShowLimitModal] = useState(false);

    useEffect(() => {
        fetchCampaigns(activeFilter);
    }, [activeFilter, fetchCampaigns]);

    const handleCreateClick = () => {
        if (!meta.can_create && user?.plan === 'free') {
            setShowLimitModal(true);
        } else {
            navigate('/campaigns/new');
        }
    };

    const handleFilterChange = (filter) => {
        setActiveFilter(filter);
    };

    return (
        <DashboardLayout title="Campagnes">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Mes Campagnes</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {meta.campaigns_this_month} / {meta.plan_limit === 999999 ? '∞' : meta.plan_limit} campagnes ce mois
                        </p>
                    </div>
                    <button
                        onClick={handleCreateClick}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold shadow-lg shadow-emerald-200 transition-all"
                    >
                        <Plus size={18} />
                        Créer une campagne
                    </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-6">
                    {FILTERS.map(filter => (
                        <button
                            key={filter.value}
                            onClick={() => handleFilterChange(filter.value)}
                            className={`
                px-4 py-2 rounded-md text-sm font-medium transition-all
                ${activeFilter === filter.value
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }
              `}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 size={32} className="text-emerald-500 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <AlertTriangle size={48} className="text-red-400 mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Erreur</h3>
                        <p className="text-gray-500 mb-4">{error}</p>
                        <button
                            onClick={() => fetchCampaigns(activeFilter)}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            Réessayer
                        </button>
                    </div>
                ) : campaigns.length === 0 ? (
                    /* Empty State */
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
                            <Target size={40} className="text-emerald-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            {activeFilter === 'all' ? 'Créez votre première campagne Facebook' : 'Aucune campagne trouvée'}
                        </h3>
                        <p className="text-gray-500 mb-6 max-w-md">
                            {activeFilter === 'all'
                                ? 'Lancez votre première publicité Facebook en quelques minutes grâce à notre assistant intelligent.'
                                : `Aucune campagne avec le statut "${FILTERS.find(f => f.value === activeFilter)?.label}".`
                            }
                        </p>
                        {activeFilter === 'all' && (
                            <button
                                onClick={handleCreateClick}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold shadow-lg shadow-emerald-200 transition-all"
                            >
                                Commencer
                                <ArrowRight size={18} />
                            </button>
                        )}
                    </div>
                ) : (
                    /* Campaign Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {campaigns.map(campaign => (
                            <CampaignCard
                                key={campaign.id}
                                campaign={campaign}
                                onUpdateStatus={updateStatus}
                                onDelete={deleteCampaign}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Limit Modal */}
            {showLimitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLimitModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in">
                        <button
                            onClick={() => setShowLimitModal(false)}
                            className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X size={20} className="text-gray-400" />
                        </button>

                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle size={32} className="text-yellow-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Limite gratuite atteinte</h3>
                            <p className="text-gray-500 mb-2">
                                Vous avez créé {meta.campaigns_this_month} campagne{meta.campaigns_this_month > 1 ? 's' : ''} ce mois (limite plan Gratuit)
                            </p>
                            <p className="text-xs text-gray-400 mb-6">
                                Réinitialisation le 1er du mois prochain
                            </p>

                            <Link
                                to="/plans"
                                className="block w-full py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold transition-colors text-center mb-3"
                            >
                                Passer à Starter (5 campagnes/mois) — 5 000 FCFA
                            </Link>
                            <button
                                onClick={() => setShowLimitModal(false)}
                                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default CampaignsListPage;
