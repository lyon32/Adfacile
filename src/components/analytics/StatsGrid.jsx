/**
 * StatsGrid — Grille de 8 cartes KPI avec evolution & mini sparklines
 */

import {
    Eye, MousePointer, CheckCircle, DollarSign,
    Users, Heart, TrendingUp, Target,
    ArrowUp, ArrowDown
} from 'lucide-react';

const STATS_CONFIG = [
    { key: 'impressions', label: 'Impressions', icon: Eye, color: '#3B82F6', subKey: null, subLabel: null, format: 'number' },
    { key: 'clicks', label: 'Clics', icon: MousePointer, color: '#10B981', subKey: 'ctr', subLabel: 'CTR', format: 'number', subFormat: 'percent' },
    { key: 'conversions', label: 'Conversions', icon: CheckCircle, color: '#8B5CF6', subKey: 'conversion_rate', subLabel: 'Taux', format: 'number', subFormat: 'percent' },
    { key: 'spend', label: 'Dépenses', icon: DollarSign, color: '#F59E0B', subKey: 'cpc', subLabel: 'CPC', format: 'currency', subFormat: 'currency' },
    { key: 'reach', label: 'Portée', icon: Users, color: '#06B6D4', subKey: 'frequency', subLabel: 'Fréquence', format: 'number', subFormat: 'decimal' },
    { key: 'post_engagement', label: 'Engagement', icon: Heart, color: '#EF4444', subKey: 'engagement_rate', subLabel: 'Taux', format: 'number', subFormat: 'percent' },
    { key: 'cpm', label: 'CPM', icon: TrendingUp, color: '#EC4899', subKey: null, subLabel: null, format: 'currency' },
    { key: 'cpa', label: 'CPA', icon: Target, color: '#F97316', subKey: null, subLabel: null, format: 'currency' }
];

function formatValue(value, format) {
    const v = value || 0;
    if (format === 'currency') return `${Math.round(v).toLocaleString()} XAF`;
    if (format === 'percent') return `${v.toFixed(2)}%`;
    if (format === 'decimal') return v.toFixed(1);
    return v.toLocaleString();
}

/**
 * Mini sparkline à base de barres CSS
 */
const MiniSparkline = ({ data = [], color }) => {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data, 1);
    return (
        <div className="analytics-sparkline">
            {data.slice(-7).map((val, i) => (
                <div
                    key={i}
                    className="analytics-sparkline-bar"
                    style={{
                        height: `${Math.max((val / max) * 100, 4)}%`,
                        background: color,
                        opacity: 0.3 + (i / 7) * 0.7
                    }}
                />
            ))}
        </div>
    );
};

const StatsGrid = ({ stats = {}, timeseries = [] }) => {
    return (
        <div className="analytics-stats-grid">
            {STATS_CONFIG.map(cfg => {
                const Icon = cfg.icon;
                const mainValue = stats[cfg.key] || 0;
                const subValue = cfg.subKey ? stats[cfg.subKey] : null;
                const sparkData = timeseries.map(d => d[cfg.key] || 0);

                // Fake evolution for display (real data would compare to previous period)
                const evolution = null; // will show nothing when no comparison data

                return (
                    <div key={cfg.key} className="analytics-stat-card">
                        <div className="analytics-stat-header">
                            <div className="analytics-stat-icon" style={{ background: `${cfg.color}15`, color: cfg.color }}>
                                <Icon size={20} />
                            </div>
                            {evolution !== null && (
                                <span className={`analytics-stat-evolution ${evolution >= 0 ? 'up' : 'down'}`}>
                                    {evolution >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                    {Math.abs(evolution).toFixed(1)}%
                                </span>
                            )}
                        </div>
                        <div className="analytics-stat-value">
                            {formatValue(mainValue, cfg.format)}
                        </div>
                        <div className="analytics-stat-label">{cfg.label}</div>
                        {subValue !== null && subValue !== undefined && (
                            <div className="analytics-stat-sub">
                                {cfg.subLabel}: {formatValue(subValue, cfg.subFormat)}
                            </div>
                        )}
                        <MiniSparkline data={sparkData} color={cfg.color} />
                    </div>
                );
            })}
        </div>
    );
};

export default StatsGrid;
