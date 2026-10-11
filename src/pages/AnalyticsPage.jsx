/**
 * AnalyticsPage — Page principale Analytics
 * AdsFacile Frontend
 *
 * 11 sections : Vue d'ensemble, Graphique, Démographie, Géographie,
 * Placements, Appareils, Comparaison campagnes, Horaire, IA, Export
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Loader2, AlertTriangle, RefreshCw, BarChart3,
    Download, FileText, FileSpreadsheet, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAnalytics } from '../hooks/useAnalytics';
import { useCampaigns } from '../hooks/useCampaigns';

import DateRangePicker from '../components/analytics/DateRangePicker';
import StatsGrid from '../components/analytics/StatsGrid';
import PerformanceChart from '../components/analytics/PerformanceChart';
import BreakdownTable from '../components/analytics/BreakdownTable';
import CampaignComparisonTable from '../components/analytics/CampaignComparisonTable';
import FeatureGate from '../components/analytics/FeatureGate';

import AIAnalyzer from '../components/ai/AIAnalyzer';
import '../styles/analytics.css';

const AnalyticsPage = () => {
    const { user } = useAuth();
    const plan = user?.plan || 'free';

    // Une campagne peut être ouverte directement depuis la liste :
    // /analytics?campaign=<id>. Le choix reste dans l'adresse pour pouvoir
    // être partagé ou rechargé.
    const [searchParams, setSearchParams] = useSearchParams();
    const campaignId = searchParams.get('campaign') || 'all';
    const setCampaignId = (id) => setSearchParams(
        id === 'all' ? {} : { campaign: id },
        { replace: true }
    );
    const [dateRange, setDateRange] = useState({ start: getDateDaysAgo(7), end: getTodayDate() });
    const [exporting, setExporting] = useState(null);

    const { data, loading, error, refresh, exportData } = useAnalytics(campaignId, dateRange);
    const { campaigns: campaignList, fetchCampaigns } = useCampaigns();

    useEffect(() => {
        fetchCampaigns('all');
    }, []);

    const handleExport = async (format) => {
        setExporting(format);
        const res = await exportData(format);
        setExporting(null);
        if (!res.success) {
            alert(res.error || 'Erreur lors de l\'export');
        }
    };

    // Breakdown column configs
    const ageColumns = [
        { key: 'age', label: 'Tranche', type: 'text' },
        { key: 'impressions', label: 'Impressions', type: 'number' },
        { key: 'clicks', label: 'Clics', type: 'number' },
        { key: 'ctr', label: 'CTR', type: 'percent' },
        { key: 'spend', label: 'Dépenses', type: 'currency' },
        { key: 'cpa', label: 'CPA', type: 'currency' }
    ];

    const genderColumns = [
        { key: 'gender', label: 'Genre', type: 'text' },
        { key: 'impressions', label: 'Impressions', type: 'number' },
        { key: 'clicks', label: 'Clics', type: 'number' },
        { key: 'ctr', label: 'CTR', type: 'percent' },
        { key: 'spend', label: 'Dépenses', type: 'currency' }
    ];

    const geoColumns = [
        { key: 'country', label: 'Pays', type: 'text' },
        { key: 'region', label: 'Région', type: 'text' },
        { key: 'impressions', label: 'Impressions', type: 'number' },
        { key: 'clicks', label: 'Clics', type: 'number' },
        { key: 'ctr', label: 'CTR', type: 'percent' },
        { key: 'spend', label: 'Dépenses', type: 'currency' }
    ];

    const placementColumns = [
        { key: 'platform', label: 'Plateforme', type: 'text' },
        { key: 'position', label: 'Position', type: 'text' },
        { key: 'impressions', label: 'Impressions', type: 'number' },
        { key: 'clicks', label: 'Clics', type: 'number' },
        { key: 'ctr', label: 'CTR', type: 'percent' },
        { key: 'spend', label: 'Dépenses', type: 'currency' },
        { key: 'cpc', label: 'CPC', type: 'currency' }
    ];

    const deviceColumns = [
        { key: 'device', label: 'Appareil', type: 'text' },
        { key: 'impressions', label: 'Impressions', type: 'number' },
        { key: 'clicks', label: 'Clics', type: 'number' },
        { key: 'ctr', label: 'CTR', type: 'percent' },
        { key: 'spend', label: 'Dépenses', type: 'currency' }
    ];

    return (
        <DashboardLayout title="Analytics">
            <div className="analytics-container">
                {/* ════════ HEADER ════════ */}
                <div className="analytics-page-header">
                    <h1 className="analytics-page-title">📊 Analytics</h1>
                    <div className="analytics-page-controls">
                        <DateRangePicker value={dateRange} onChange={setDateRange} />

                        <select
                            value={campaignId}
                            onChange={(e) => setCampaignId(e.target.value)}
                            className="analytics-campaign-select"
                        >
                            <option value="all">Toutes les campagnes</option>
                            {(campaignList || []).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        <button onClick={refresh} className="analytics-datepicker-btn" title="Actualiser">
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>

                {/* ════════ LOADING / ERROR ════════ */}
                {loading ? (
                    <div className="analytics-loading">
                        <Loader2 size={36} className="analytics-spinner" />
                        <span className="analytics-loading-text">Chargement des analytics...</span>
                    </div>
                ) : error ? (
                    <div className="analytics-error">
                        <div className="analytics-error-icon">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="analytics-error-title">Erreur de chargement</h3>
                        <p className="analytics-error-msg">{error}</p>
                        <button onClick={refresh} className="analytics-retry-btn">
                            <RefreshCw size={16} />
                            Réessayer
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ════════ SECTION 1: VUE D'ENSEMBLE ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">👁️ Vue d'ensemble</h2>
                            {/* Un « 0 » de conversions peut vouloir dire « pas de pixel » :
                                on le dit au lieu de laisser croire à une campagne sans résultat. */}
                            <p className="analytics-conversions-note">
                                Impressions, clics et dépenses viennent de la publicité. Les conversions
                                (achats, inscriptions) viennent du pixel installé sur votre site : sans lui,
                                elles restent à zéro.
                            </p>
                            <StatsGrid
                                stats={data?.overview || {}}
                                timeseries={data?.timeseries || []}
                            />
                        </div>

                        {/* ════════ SECTION 2: GRAPHIQUE ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">📈 Performances dans le temps</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Graphiques avancés">
                                <PerformanceChart data={data?.timeseries || []} />
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 3: DÉMOGRAPHIE ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">👥 Répartition démographique</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Analyse démographique">
                                <div className="analytics-breakdown-grid">
                                    <BreakdownTable
                                        title="Par tranche d'âge"
                                        columns={ageColumns}
                                        data={data?.demographics?.byAge || []}
                                    />
                                    <BreakdownTable
                                        title="Par genre"
                                        columns={genderColumns}
                                        data={data?.demographics?.byGender || []}
                                    />
                                </div>
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 4: GÉOGRAPHIE ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">🌍 Performances géographiques</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Analyse géographique">
                                <BreakdownTable
                                    title="Par localisation"
                                    columns={geoColumns}
                                    data={data?.geography || []}
                                />
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 5: PLACEMENTS ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">📱 Performances par placement</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Analyse placements">
                                <BreakdownTable
                                    title="Placements"
                                    columns={placementColumns}
                                    data={data?.placements || []}
                                />
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 6: APPAREILS ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">💻 Performances par appareil</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Analyse appareils">
                                <BreakdownTable
                                    title="Appareils"
                                    columns={deviceColumns}
                                    data={data?.devices || []}
                                />
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 7: COMPARAISON CAMPAGNES ════════ */}
                        <div className="analytics-section">
                            <CampaignComparisonTable
                                campaigns={data?.campaigns || []}
                                onExport={plan === 'pro' || plan === 'agency' ? () => handleExport('xlsx') : null}
                            />
                        </div>

                        {/* ════════ SECTION 8: HORAIRE ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">🕐 Performances par heure</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Analyse horaire">
                                <HourlyTable data={data?.hourly || []} />
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 9: ANALYSE IA ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">🤖 Analyse IA</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Analyse IA des performances">
                                <AIAnalyzer plan={plan} />
                            </FeatureGate>
                        </div>

                        {/* ════════ SECTION 10: EXPORT ════════ */}
                        <div className="analytics-section">
                            <h2 className="analytics-section-title">📥 Exporter vos données</h2>
                            <FeatureGate requiredPlan="pro" currentPlan={plan} featureName="Export de données">
                                <div className="analytics-export-card">
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1rem' }}>
                                        Téléchargez vos données de performance dans le format de votre choix.
                                    </p>
                                    <div className="analytics-export-btns">
                                        <button
                                            onClick={() => handleExport('csv')}
                                            disabled={exporting === 'csv'}
                                            className="analytics-export-btn"
                                        >
                                            <FileText size={18} />
                                            {exporting === 'csv' ? 'Export...' : 'Exporter CSV'}
                                        </button>
                                        <button
                                            onClick={() => handleExport('xlsx')}
                                            disabled={exporting === 'xlsx'}
                                            className="analytics-export-btn"
                                        >
                                            <FileSpreadsheet size={18} />
                                            {exporting === 'xlsx' ? 'Export...' : 'Exporter Excel'}
                                        </button>
                                    </div>
                                </div>
                            </FeatureGate>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Hourly Table (simple, inline component)
// ═══════════════════════════════════════════════════════════════════════════════

const HourlyTable = ({ data = [] }) => {
    if (data.length === 0) {
        return (
            <div className="analytics-breakdown-card">
                <p className="analytics-breakdown-empty">Aucune donnée horaire disponible</p>
            </div>
        );
    }

    const maxImp = Math.max(...data.map(d => d.impressions), 1);
    const maxClk = Math.max(...data.map(d => d.clicks), 1);

    return (
        <div className="analytics-breakdown-card">
            <div className="analytics-breakdown-table-wrap">
                <table className="analytics-hourly-table">
                    <thead>
                        <tr>
                            <th className="analytics-hourly-th">Heure</th>
                            <th className="analytics-hourly-th">Impressions</th>
                            <th className="analytics-hourly-th" style={{ width: '30%' }}>
                                <span style={{ color: '#3B82F6' }}>■</span> Impressions
                            </th>
                            <th className="analytics-hourly-th">Clics</th>
                            <th className="analytics-hourly-th" style={{ width: '20%' }}>
                                <span style={{ color: '#10B981' }}>■</span> Clics
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(row => (
                            <tr key={row.hour}>
                                <td className="analytics-hourly-td" style={{ fontWeight: 700 }}>{row.label}</td>
                                <td className="analytics-hourly-td">{row.impressions.toLocaleString()}</td>
                                <td className="analytics-hourly-bar-cell">
                                    <div
                                        className="analytics-hourly-bar impressions"
                                        style={{ width: `${(row.impressions / maxImp) * 100}%` }}
                                    />
                                </td>
                                <td className="analytics-hourly-td">{row.clicks.toLocaleString()}</td>
                                <td className="analytics-hourly-bar-cell">
                                    <div
                                        className="analytics-hourly-bar clicks"
                                        style={{ width: `${(row.clicks / maxClk) * 100}%` }}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Helpers
function getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

export default AnalyticsPage;
