/**
 * BreakdownTable — Table triable réutilisable pour les breakdowns
 * Props : title, columns, data
 */

import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';

const BreakdownTable = ({ title, columns = [], data = [], limit = 10 }) => {
    const [sortKey, setSortKey] = useState(null);
    const [sortDir, setSortDir] = useState('desc');
    const [showAll, setShowAll] = useState(false);

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    let sortedData = [...data];
    if (sortKey) {
        sortedData.sort((a, b) => {
            const va = a[sortKey] ?? 0;
            const vb = b[sortKey] ?? 0;
            return sortDir === 'desc' ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
        });
    }

    const displayData = showAll ? sortedData : sortedData.slice(0, limit);

    // Find max value per numeric column for visual bars
    const maxValues = {};
    columns.forEach(col => {
        if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
            maxValues[col.key] = Math.max(...data.map(d => d[col.key] || 0), 1);
        }
    });

    const formatCell = (value, type) => {
        if (value === null || value === undefined) return '—';
        if (type === 'currency') return `${Math.round(value).toLocaleString()} XAF`;
        if (type === 'percent') return `${parseFloat(value).toFixed(2)}%`;
        if (type === 'number') return parseInt(value).toLocaleString();
        return value;
    };

    if (data.length === 0) {
        return (
            <div className="analytics-breakdown-card">
                <h4 className="analytics-breakdown-title">{title}</h4>
                <p className="analytics-breakdown-empty">Aucune donnée disponible</p>
            </div>
        );
    }

    return (
        <div className="analytics-breakdown-card">
            <h4 className="analytics-breakdown-title">{title}</h4>
            <div className="analytics-breakdown-table-wrap">
                <table className="analytics-breakdown-table">
                    <thead>
                        <tr>
                            {columns.map(col => (
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
                        {displayData.map((row, i) => (
                            <tr key={i} className="analytics-breakdown-tr">
                                {columns.map(col => (
                                    <td key={col.key} className="analytics-breakdown-td">
                                        <div className="analytics-breakdown-cell">
                                            <span>{formatCell(row[col.key], col.type)}</span>
                                            {(col.type === 'number' || col.type === 'currency') && maxValues[col.key] && (
                                                <div className="analytics-breakdown-bar">
                                                    <div
                                                        className="analytics-breakdown-bar-fill"
                                                        style={{
                                                            width: `${((row[col.key] || 0) / maxValues[col.key]) * 100}%`
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length > limit && !showAll && (
                <button onClick={() => setShowAll(true)} className="analytics-breakdown-show-all">
                    Voir tout ({data.length} lignes)
                </button>
            )}
        </div>
    );
};

export default BreakdownTable;
