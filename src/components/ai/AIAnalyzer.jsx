/**
 * AIAnalyzer — Analyse IA avancée (🔒 PRO uniquement)
 * AdsFacile Frontend
 * 
 * Affiché mais bloqué pour free/starter
 * Débloqué pour pro/agency
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Brain, Lock, Sparkles, Loader2, BarChart3,
    Target, Eye, AlertTriangle
} from 'lucide-react';
import api from '../../services/api';
import './AIComponents.css';

const ANALYSIS_TYPES = [
    {
        value: 'competitor_ad',
        label: 'Analyse concurrence',
        icon: Eye,
        desc: 'Analysez une pub concurrente et obtenez des recommandations'
    },
    {
        value: 'my_performance',
        label: 'Diagnostic performances',
        icon: BarChart3,
        desc: 'Diagnostiquez les performances de votre campagne'
    },
    {
        value: 'audience_insight',
        label: 'Insights audience',
        icon: Target,
        desc: 'Comprenez mieux votre audience cible'
    }
];

const AIAnalyzer = ({ plan = 'free' }) => {
    const isPro = plan === 'pro' || plan === 'agency';
    const [activeType, setActiveType] = useState('competitor_ad');
    const [inputText, setInputText] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAnalyze = async () => {
        if (!inputText.trim()) {
            setError('Veuillez entrer un texte à analyser');
            return;
        }

        setLoading(true);
        setError('');
        setAnalysis(null);

        try {
            const res = await api.post('/ai/analyze', {
                text: inputText.trim(),
                analysisType: activeType
            });

            if (res.data.success) {
                setAnalysis(res.data.analysis);
            } else if (res.data.error === 'upgrade_required') {
                setError('Cette fonctionnalité nécessite le plan PRO');
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Erreur lors de l\'analyse';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // ─── Vue bloquée (non-PRO) ───
    if (!isPro) {
        return (
            <div className="ai-analyzer ai-locked">
                <div className="ai-locked-overlay">
                    <Lock size={28} />
                    <h4>Analyse IA avancée</h4>
                    <p>Analysez vos concurrents, comprenez vos performances et obtenez des insights détaillés sur votre audience</p>
                    <span className="ai-locked-badge">🔒 Plan PRO requis</span>
                    <Link to="/plans" className="ai-unlock-btn">
                        <Sparkles size={16} />
                        Débloquer avec PRO — 12,000 FCFA/mois
                    </Link>
                </div>

                {/* Preview grisée en arrière-plan */}
                <div className="ai-analyzer-preview">
                    <div className="ai-analyzer-types">
                        {ANALYSIS_TYPES.map(type => {
                            const Icon = type.icon;
                            return (
                                <div key={type.value} className="ai-type-card-preview">
                                    <Icon size={20} />
                                    <span>{type.label}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="ai-analyzer-form-preview">
                        <div className="ai-field-preview" />
                        <div className="ai-field-preview short" />
                        <div className="ai-btn-preview" />
                    </div>
                </div>
            </div>
        );
    }

    // ─── Vue débloquée (PRO/Agency) ───
    return (
        <div className="ai-analyzer">
            <div className="ai-header">
                <div className="ai-title">
                    <Brain size={20} />
                    <h4>Analyse IA avancée</h4>
                </div>
                <span className="ai-pro-badge">PRO</span>
            </div>

            {/* Types d'analyse */}
            <div className="ai-analyzer-types">
                {ANALYSIS_TYPES.map(type => {
                    const Icon = type.icon;
                    return (
                        <button
                            key={type.value}
                            className={`ai-type-btn ${activeType === type.value ? 'active' : ''}`}
                            onClick={() => { setActiveType(type.value); setAnalysis(null); }}
                        >
                            <Icon size={16} />
                            <span>{type.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Description du type sélectionné */}
            <p className="ai-type-desc">
                {ANALYSIS_TYPES.find(t => t.value === activeType)?.desc}
            </p>

            {/* Zone de texte */}
            <div className="ai-field">
                <label htmlFor="ai-analyze-text">
                    {activeType === 'competitor_ad' && 'Collez le texte de la pub concurrente'}
                    {activeType === 'my_performance' && 'Décrivez les résultats de votre campagne'}
                    {activeType === 'audience_insight' && 'Décrivez votre audience cible actuelle'}
                </label>
                <textarea
                    id="ai-analyze-text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Collez ou décrivez ici..."
                    rows={5}
                    maxLength={2000}
                />
            </div>

            {error && (
                <div className="ai-error">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            <button
                className="ai-generate-btn"
                onClick={handleAnalyze}
                disabled={loading}
            >
                {loading ? (
                    <><Loader2 size={18} className="ai-spin" /> Analyse en cours...</>
                ) : (
                    <><Brain size={18} /> Lancer l'analyse</>
                )}
            </button>

            {/* Résultat */}
            {analysis && (
                <div className="ai-analysis-result">
                    <h4><Sparkles size={16} /> Résultat de l'analyse</h4>
                    {renderAnalysis(analysis, activeType)}
                </div>
            )}
        </div>
    );
};

/**
 * Affiche le résultat de l'analyse selon le type
 */
function renderAnalysis(data, type) {
    if (!data) return null;

    return (
        <div className="ai-analysis-content">
            {/* Score global */}
            {(data.score !== undefined || data.score_global !== undefined) && (
                <div className="ai-score">
                    <span className="ai-score-value">{data.score ?? data.score_global}/10</span>
                    <span className="ai-score-label">Score global</span>
                </div>
            )}

            {/* Diagnostic */}
            {data.diagnostic && (
                <div className="ai-analysis-section">
                    <h5>📋 Diagnostic</h5>
                    <p>{data.diagnostic}</p>
                </div>
            )}

            {/* Profil type */}
            {data.profil_type && (
                <div className="ai-analysis-section">
                    <h5>👤 Profil type</h5>
                    <p>{data.profil_type}</p>
                </div>
            )}

            {/* Listes positives */}
            {(data.forces || data.points_forts || data.motivations || []).length > 0 && (
                <div className="ai-analysis-section positive">
                    <h5>✅ {type === 'competitor_ad' ? 'Forces' : type === 'audience_insight' ? 'Motivations' : 'Points forts'}</h5>
                    <ul>
                        {(data.forces || data.points_forts || data.motivations || []).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Listes négatives */}
            {(data.faiblesses || data.points_faibles || data.freins || []).length > 0 && (
                <div className="ai-analysis-section negative">
                    <h5>⚠️ {type === 'competitor_ad' ? 'Faiblesses' : type === 'audience_insight' ? 'Freins' : 'Points faibles'}</h5>
                    <ul>
                        {(data.faiblesses || data.points_faibles || data.freins || []).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Recommandations / Actions */}
            {(data.recommandations || data.actions_immediates || data.messages_cles || []).length > 0 && (
                <div className="ai-analysis-section action">
                    <h5>🚀 {type === 'audience_insight' ? 'Messages clés' : 'Actions recommandées'}</h5>
                    <ul>
                        {(data.recommandations || data.actions_immediates || data.messages_cles || []).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Stratégie contre (competitor) */}
            {data.strategie_contre && (
                <div className="ai-analysis-section">
                    <h5>🎯 Stratégie recommandée</h5>
                    <p>{data.strategie_contre}</p>
                </div>
            )}

            {/* Meilleur moment (audience) */}
            {data.meilleur_moment_pub && (
                <div className="ai-analysis-section">
                    <h5>⏰ Meilleur moment pour publier</h5>
                    <p>{data.meilleur_moment_pub}</p>
                </div>
            )}

            {/* Canaux préférés (audience) */}
            {data.canaux_preferes && data.canaux_preferes.length > 0 && (
                <div className="ai-analysis-section">
                    <h5>📱 Canaux préférés</h5>
                    <div className="ai-tags-row">
                        {data.canaux_preferes.map((c, i) => (
                            <span key={i} className="ai-tag">{c}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default AIAnalyzer;
