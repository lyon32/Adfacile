/**
 * PerformanceChart — Graphique multi-courbes avec toggles métriques
 * Utilise Recharts (LineChart)
 */

import { useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Download } from 'lucide-react';

const METRICS = [
    { key: 'impressions', label: 'Impressions', color: '#3B82F6' },
    { key: 'clicks', label: 'Clics', color: '#10B981' },
    { key: 'conversions', label: 'Conversions', color: '#8B5CF6' },
    { key: 'spend', label: 'Dépenses (XAF)', color: '#F59E0B' },
    { key: 'ctr', label: 'CTR (%)', color: '#06B6D4' },
    { key: 'cpc', label: 'CPC (XAF)', color: '#EC4899' }
];

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
        <div className="analytics-chart-tooltip">
            <p className="analytics-chart-tooltip-label">{label}</p>
            {payload.map((entry, i) => (
                <div key={i} className="analytics-chart-tooltip-row">
                    <span className="analytics-chart-tooltip-dot" style={{ background: entry.color }} />
                    <span>{entry.name}: </span>
                    <strong>{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</strong>
                </div>
            ))}
        </div>
    );
};

const PerformanceChart = ({ data = [] }) => {
    const [visibleMetrics, setVisibleMetrics] = useState(['impressions', 'clicks']);

    const toggleMetric = (key) => {
        setVisibleMetrics(prev =>
            prev.includes(key)
                ? prev.filter(k => k !== key)
                : [...prev, key]
        );
    };

    const exportChart = () => {
        const svgElement = document.querySelector('.recharts-wrapper svg');
        if (!svgElement) return;

        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new window.Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx.scale(2, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            const pngUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `analytics_chart_${Date.now()}.png`;
            link.href = pngUrl;
            link.click();
        };
        img.src = url;
    };

    // Format date for X axis
    const formattedData = data.map(d => ({
        ...d,
        dateLabel: d.date ? new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''
    }));

    return (
        <div className="analytics-chart-card">
            <div className="analytics-chart-controls">
                <div className="analytics-chart-toggles">
                    {METRICS.map(metric => (
                        <button
                            key={metric.key}
                            onClick={() => toggleMetric(metric.key)}
                            className={`analytics-chart-toggle ${visibleMetrics.includes(metric.key) ? 'active' : ''}`}
                        >
                            <span className="analytics-chart-toggle-dot" style={{ background: metric.color }} />
                            {metric.label}
                        </button>
                    ))}
                </div>
                <button onClick={exportChart} className="analytics-chart-export-btn">
                    <Download size={14} />
                    PNG
                </button>
            </div>

            {data.length > 0 ? (
                <ResponsiveContainer width="100%" height={380}>
                    <LineChart data={formattedData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        {visibleMetrics.map(metricKey => {
                            const metric = METRICS.find(m => m.key === metricKey);
                            if (!metric) return null;
                            return (
                                <Line
                                    key={metricKey}
                                    type="monotone"
                                    dataKey={metricKey}
                                    name={metric.label}
                                    stroke={metric.color}
                                    strokeWidth={2.5}
                                    dot={false}
                                    activeDot={{ r: 5, strokeWidth: 2 }}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <div className="analytics-chart-empty">
                    <p>Aucune donnée disponible pour cette période</p>
                </div>
            )}
        </div>
    );
};

export default PerformanceChart;
