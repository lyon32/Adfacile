/**
 * CampaignCard — Carte de campagne dans la liste
 * Affiche le résumé d'une campagne avec actions
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    MoreVertical, Play, Pause, Trash2, Eye, TrendingUp,
    MousePointer, DollarSign, Calendar, Loader2, BarChart3
} from 'lucide-react';

const STATUS_BADGES = {
    active: { label: 'Active', color: 'bg-green-100 text-green-700' },
    paused: { label: 'En pause', color: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'Terminée', color: 'bg-gray-100 text-gray-600' },
    error: { label: 'Erreur', color: 'bg-red-100 text-red-700' },
    pending: { label: 'En attente', color: 'bg-blue-100 text-blue-700' }
};

const OBJECTIVE_LABELS = {
    'OUTCOME_AWARENESS': 'Notoriété',
    'OUTCOME_TRAFFIC': 'Trafic',
    'LINK_CLICKS': 'Trafic',
    'OUTCOME_ENGAGEMENT': 'Engagement',
    'OUTCOME_LEADS': 'Prospects',
    'OUTCOME_APP_PROMOTION': 'Application',
    'APP_INSTALLS': 'Application',
    'OUTCOME_SALES': 'Ventes'
};

const CampaignCard = ({ campaign, onUpdateStatus, onRequestDelete, deleting = false }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const actionLoading = statusLoading || deleting;

    const status = STATUS_BADGES[campaign.status] || STATUS_BADGES.paused;
    const objectiveLabel = OBJECTIVE_LABELS[campaign.objective] || campaign.objective;

    const handleStatusToggle = async () => {
        if (actionLoading) return;
        setStatusLoading(true);
        setMenuOpen(false);
        try {
            const newStatus = campaign.status === 'active' ? 'paused' : 'active';
            await onUpdateStatus(campaign.id, newStatus);
        } finally {
            setStatusLoading(false);
        }
    };

    const handleDelete = () => {
        setMenuOpen(false);
        onRequestDelete(campaign);
    };

    const formatBudget = (budget) => {
        if (!budget) return '—';
        return `${Number(budget).toLocaleString('fr-FR')} FCFA`;
    };

    const formatDate = (date) => {
        if (!date) return '—';
        return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div
            className={`bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 overflow-hidden ${deleting ? 'opacity-50 pointer-events-none' : ''}`}
            aria-busy={deleting}
        >
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{objectiveLabel}</span>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-400">{formatDate(campaign.created_at)}</span>
                    </div>
                </div>

                {/* Menu 3 dots */}
                <div className="relative">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <MoreVertical size={18} className="text-gray-400" />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1">
                                <button
                                    onClick={handleStatusToggle}
                                    disabled={actionLoading}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    {campaign.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                                    {campaign.status === 'active' ? 'Mettre en pause' : 'Activer'}
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={actionLoading}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 size={16} />
                                    Supprimer
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Body */}
            <div className="px-5 py-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <Eye size={14} className="text-gray-400" />
                            <span className="text-xs text-gray-500">Impressions</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900">
                            {campaign.impressions ? Number(campaign.impressions).toLocaleString('fr-FR') : '0'}
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <MousePointer size={14} className="text-gray-400" />
                            <span className="text-xs text-gray-500">Clics</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900">
                            {campaign.clicks ? Number(campaign.clicks).toLocaleString('fr-FR') : '0'}
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <DollarSign size={14} className="text-gray-400" />
                            <span className="text-xs text-gray-500">Budget</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900">
                            {formatBudget(campaign.daily_budget)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(campaign.start_date)}
                    {campaign.end_date && ` → ${formatDate(campaign.end_date)}`}
                </span>
                <div className="flex gap-2">
                    <Link
                        to={`/analytics?campaign=${encodeURIComponent(campaign.id)}`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
                        aria-label={`Voir les analytics de ${campaign.name}`}
                    >
                        <BarChart3 size={12} />
                        Analytics
                    </Link>
                    <button
                        onClick={handleStatusToggle}
                        disabled={actionLoading}
                        className={`
              flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${campaign.status === 'active'
                                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            }
              ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        {statusLoading
                            ? <Loader2 size={12} className="animate-spin" />
                            : campaign.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
                        {campaign.status === 'active' ? 'Pause' : 'Activer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CampaignCard;
