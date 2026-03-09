/**
 * CampaignsListPage — Liste des campagnes
 * AdsFacile Frontend
 *
 * Affiche les campagnes avec filtres, empty state, et modal limite plan
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Plus, Target, Loader2, AlertTriangle,
    X, ArrowRight, Megaphone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import CampaignCard from '../components/campaigns/CampaignCard';
import { useCampaigns } from '../hooks/useCampaigns';
import { useFacebook } from '../hooks/useFacebook';
import ConnectFacebookButton from '../components/facebook/ConnectFacebookButton';
import '../styles/campaigns-list.css';

const FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'active', label: '🟢 Actives' },
    { value: 'paused', label: '⏸️ En pause' },
    { value: 'completed', label: '✅ Terminées' }
];

const CampaignsListPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { campaigns, loading, error, meta, fetchCampaigns, updateStatus, deleteCampaign } = useCampaigns();
    const { connected: fbConnected, loading: fbLoading } = useFacebook();
    const [activeFilter, setActiveFilter] = useState('all');
    const [showLimitModal, setShowLimitModal] = useState(false);

    useEffect(() => {
        fetchCampaigns(activeFilter);
    }, [activeFilter, fetchCampaigns]);

    const handleCreateClick = () => {
        if (!fbConnected) {
            alert("Vous devez d'abord connecter votre compte Facebook !");
            return;
        }

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
            <div className="campaigns-container">
                {/* Header */}
                <div className="campaigns-header">
                    <div>
                        <h1 className="campaigns-title">Mes Campagnes</h1>
                        <p className="campaigns-subtitle">
                            <strong>{meta.campaigns_this_month}</strong> / {meta.plan_limit === 999999 ? '∞' : meta.plan_limit} campagnes ce mois
                        </p>
                    </div>
                    <button onClick={handleCreateClick} className="campaigns-create-btn">
                        <Plus size={18} />
                        Créer une campagne
                    </button>
                </div>

                {/* FB Connection Alert */}
                {!fbLoading && !fbConnected && (
                    <div className="campaigns-fb-alert" style={{
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '0.5rem',
                        padding: '1.25rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        alignItems: 'flex-start'
                    }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <AlertTriangle size={24} color="#EF4444" />
                            <div>
                                <h3 style={{ margin: 0, color: '#991B1B', fontSize: '1.125rem' }}>Connexion Facebook requise</h3>
                                <p style={{ margin: '0.25rem 0 0 0', color: '#B91C1C', fontSize: '0.875rem' }}>
                                    Vous devez connecter votre compte Facebook Business pour pouvoir créer et diffuser des campagnes publicitaires.
                                </p>
                            </div>
                        </div>
                        <div style={{ width: '100%', maxWidth: '350px' }}>
                            <ConnectFacebookButton />
                        </div>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="campaigns-filters">
                    {FILTERS.map(filter => (
                        <button
                            key={filter.value}
                            onClick={() => handleFilterChange(filter.value)}
                            className={`campaigns-filter-btn ${activeFilter === filter.value ? 'active' : ''}`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="campaigns-loading">
                        <Loader2 size={36} className="campaigns-spinner" />
                        <span className="campaigns-loading-text">Chargement des campagnes...</span>
                    </div>
                ) : error ? (
                    <div className="campaigns-error">
                        <div className="campaigns-error-icon">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="campaigns-error-title">Oups, une erreur s'est produite</h3>
                        <p className="campaigns-error-msg">{error}</p>
                        <button
                            onClick={() => fetchCampaigns(activeFilter)}
                            className="campaigns-retry-btn"
                        >
                            Réessayer
                        </button>
                    </div>
                ) : campaigns.length === 0 ? (
                    /* Empty State */
                    <div className="campaigns-empty">
                        <div className="campaigns-empty-icon-wrap">
                            <Megaphone size={40} className="campaigns-empty-icon" />
                        </div>
                        <h3 className="campaigns-empty-title">
                            {activeFilter === 'all' ? 'Créez votre première campagne' : 'Aucune campagne trouvée'}
                        </h3>
                        <p className="campaigns-empty-text">
                            {activeFilter === 'all'
                                ? 'Lancez votre première publicité Facebook en quelques minutes grâce à notre assistant intelligent.'
                                : `Aucune campagne avec le statut "${FILTERS.find(f => f.value === activeFilter)?.label}".`
                            }
                        </p>
                        {activeFilter === 'all' && (
                            <button onClick={handleCreateClick} className="campaigns-empty-btn">
                                Commencer
                                <ArrowRight size={18} />
                            </button>
                        )}
                    </div>
                ) : (
                    /* Campaign Grid */
                    <div className="campaigns-grid">
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
                <div className="campaigns-modal-overlay">
                    <div className="campaigns-modal-backdrop" onClick={() => setShowLimitModal(false)} />
                    <div className="campaigns-modal">
                        <button
                            onClick={() => setShowLimitModal(false)}
                            className="campaigns-modal-close"
                        >
                            <X size={18} />
                        </button>

                        <div className="campaigns-modal-icon-wrap">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="campaigns-modal-title">Limite gratuite atteinte</h3>
                        <p className="campaigns-modal-text">
                            Vous avez créé {meta.campaigns_this_month} campagne{meta.campaigns_this_month > 1 ? 's' : ''} ce mois (limite plan Gratuit)
                        </p>
                        <p className="campaigns-modal-hint">
                            Réinitialisation le 1er du mois prochain
                        </p>

                        <Link to="/plans" className="campaigns-modal-upgrade">
                            Passer à Starter — 5 000 FCFA/mois
                        </Link>
                        <button
                            onClick={() => setShowLimitModal(false)}
                            className="campaigns-modal-cancel"
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default CampaignsListPage;
