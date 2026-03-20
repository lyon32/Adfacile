/**
 * CampaignComparisonTable — Comparaison des performances par campagne
 * Avec tri, recherche, pagination, et actions sur chaque ligne
 */

import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, MoreHorizontal } from 'lucide-react';

const COLUMNS = [
    { key: 'name', label: 'Campagne', type: 'text' },
    { key: 'objective', label: 'Objectif', type: 'text' },
    { key: 'daily_budget', label: 'Budget/J', type: 'currency' },
    { key: 'impressions', label: 'Impressions', type: 'number' },
    { key: 'clicks', label: 'Clics', type: 'number' },
    { key: 'ctr', label: 'CTR', type: 'percent' },
    { key: 'conversions', label: 'Conv.', type: 'number' },
    { key: 'spend', label: 'Dépenses', type: 'currency' },
    { key: 'cpc', label: 'CPC', type: 'currency' },
    { key: 'cpa', label: 'CPA', type: 'currency' }
];

const STATUS_COLORS = {
    active: { bg: '#ecfdf5', color: '#059669', label: '🟢' },
    paused: { bg: '#fef9c3', color: '#ca8a04', label: '⏸️' },
    completed: { bg: '#f1f5f9', color: '#64748b', label: '✅' }
};

const CampaignComparisonTable = ({ campaigns = [], onExport }) => {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('spend');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage] = useState(0);
    const perPage = 10;

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const filteredData = useMemo(() => {
        let result = [...campaigns];
        if (search.trim()) {
            const s = search.toLowerCase();
            result = result.filter(c => c.name?.toLowerCase().includes(s));
        }
        if (sortKey) {
            result.sort((a, b) => {
                const va = a[sortKey] ?? 0;
                const vb = b[sortKey] ?? 0;
                if (typeof va === 'string') {
                    return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
                }
                return sortDir === 'desc' ? vb - va : va - vb;
            });
        }
        return result;
    }, [campaigns, search, sortKey, sortDir]);

    const totalPages = Math.ceil(filteredData.length / perPage);
    const pageData = filteredData.slice(page * perPage, (page + 1) * perPage);

    const formatCell = (value, type) => {
        if (value === null || value === undefined) return '—';
        if (type === 'currency') return `${Math.round(value).toLocaleString()} XAF`;
        if (type === 'percent') return `${parseFloat(value).toFixed(2)}%`;
        if (type === 'number') return parseInt(value).toLocaleString();
        return value;
    };

    const OBJECTIVE_LABELS = {
        'LINK_CLICKS': '🔗 Clics',
        'OUTCOME_ENGAGEMENT': '💬 Engagement',
        'OUTCOME_LEADS': '📋 Leads',
        'OUTCOME_SALES': '🛒 Ventes',
        'OUTCOME_AWARENESS': '👁️ Notoriété'
    };

    if (campaigns.length === 0) {
        return (
            <div className="analytics-comparison-card">
                <h3 className="analytics-section-title">📊 Comparaison des campagnes</h3>
                <p className="analytics-breakdown-empty">Aucune campagne avec des données pour cette période</p>
            </div>
        );
    }

    return (
        <div className="analytics-comparison-card">
            <div className="analytics-comparison-header">
                <h3 className="analytics-section-title">📊 Comparaison des campagnes</h3>
                <div className="analytics-comparison-actions">
                    <div className="analytics-comparison-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        />
                    </div>
                    {onExport && (
                        <button onClick={onExport} className="analytics-comparison-export-btn">
                            Exporter
                        </button>
                    )}
                </div>
            </div>

            <div className="analytics-breakdown-table-wrap">
                <table className="analytics-breakdown-table">
                    <thead>
                        <tr>
                            {COLUMNS.map(col => (
                                <th
                                    key={col.key}
                                    onClick={() => handleSort(col.key)}
                                    className="analytics-breakdown-th"
                                >
                                    <span>{col.label}</span>
                                    <ArrowUpDown size={12} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pageData.map((row, i) => (
                            <tr key={row.id || i} className="analytics-breakdown-tr">
                                {COLUMNS.map(col => (
                                    <td key={col.key} className="analytics-breakdown-td">
                                        {col.key === 'name' ? (
                                            <div className="analytics-comparison-name">
                                                <span className="analytics-comparison-status-dot">
                                                    {STATUS_COLORS[row.status]?.label || '⚪'}
                                                </span>
                                                <span>{row.name}</span>
                                            </div>
                                        ) : col.key === 'objective' ? (
                                            <span className="analytics-comparison-objective">
                                                {OBJECTIVE_LABELS[row.objective] || row.objective}
                                            </span>
                                        ) : (
                                            formatCell(row[col.key], col.type)
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="analytics-comparison-pagination">
                    <span className="analytics-comparison-page-info">
                        Page {page + 1} / {totalPages} ({filteredData.length} campagnes)
                    </span>
                    <div className="analytics-comparison-page-btns">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="analytics-comparison-page-btn"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="analytics-comparison-page-btn"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CampaignComparisonTable;
