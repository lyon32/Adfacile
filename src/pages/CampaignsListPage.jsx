/**
 * CampaignsListPage — Liste des campagnes
 * AdsFacile Frontend
 *
 * Affiche les campagnes avec filtres, empty state, et modal limite plan
 */

import { useState, useEffect, useCallback } from 'react';
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
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ToastStack, { useToasts } from '../components/ui/Toast';
import '../styles/campaigns-list.css';

const FILTERS = [
    { value: 'all', label: 'Toutes', dot: null },
    { value: 'active', label: 'Actives', dot: 'active' },
    { value: 'paused', label: 'En pause', dot: 'paused' },
    { value: 'completed', label: 'Terminées', dot: 'completed' }
];

const CampaignsListPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { campaigns, loading, error, meta, fetchCampaigns, updateStatus, deleteCampaign } = useCampaigns();
    const { connected: fbConnected, loading: fbLoading } = useFacebook();
    const [activeFilter, setActiveFilter] = useState('all');
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [campaignToDelete, setCampaignToDelete] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const { toasts, showToast, dismissToast } = useToasts();

    useEffect(() => {
        fetchCampaigns(activeFilter);
    }, [activeFilter, fetchCampaigns]);

    const handleStatusChange = useCallback(async (id, status) => {
        try {
            await updateStatus(id, status);
            showToast('success', status === 'active' ? 'Campagne activée' : 'Campagne mise en pause');
        } catch (err) {
            showToast('error', err.message || 'Le statut n\'a pas pu être modifié');
        }
    }, [updateStatus, showToast]);

    const handleConfirmDelete = async () => {
        if (!campaignToDelete) return;
        const { id, name } = campaignToDelete;
        setDeletingId(id);
        try {
            await deleteCampaign(id);
            setCampaignToDelete(null);
            showToast('success', `Campagne « ${name} » supprimée`);
            // Recharge la liste et les compteurs du plan après suppression.
            fetchCampaigns(activeFilter);
        } catch (err) {
            showToast('error', err.message || 'La campagne n\'a pas pu être supprimée');
        } finally {
            setDeletingId(null);
        }
    };

    const handleCreateClick = () => {
        if (!fbConnected) {
            showToast('info', 'Connectez votre compte Facebook pour créer une campagne');
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
                    <div className="campaigns-fb-alert" style={{ marginBottom: '1.5rem' }}>
                        <ConnectFacebookButton />
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="campaigns-filters">
                    {FILTERS.map(filter => (
                        <button
                            key={filter.value}
                            onClick={() => handleFilterChange(filter.value)}
                            className={`campaigns-filter-btn ${activeFilter === filter.value ? 'active' : ''}`}
                            aria-pressed={activeFilter === filter.value}
                        >
                            {filter.dot && <span className={`campaigns-filter-dot campaigns-filter-dot--${filter.dot}`} />}
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
                                onUpdateStatus={handleStatusChange}
                                onRequestDelete={setCampaignToDelete}
                                deleting={deletingId === campaign.id}
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

            {/* Confirmation de suppression */}
            <ConfirmDialog
                open={Boolean(campaignToDelete)}
                title="Supprimer cette campagne ?"
                message={campaignToDelete
                    ? `« ${campaignToDelete.name} » sera supprimée d'AdsFacile et de Facebook.`
                    : ''}
                hint="Cette action est définitive."
                confirmLabel="Supprimer"
                loadingLabel="Suppression…"
                cancelLabel="Annuler"
                tone="danger"
                loading={Boolean(deletingId)}
                onConfirm={handleConfirmDelete}
                onCancel={() => setCampaignToDelete(null)}
            />

            <ToastStack toasts={toasts} onDismiss={dismissToast} />
        </DashboardLayout>
    );
};

export default CampaignsListPage;
