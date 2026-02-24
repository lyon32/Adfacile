/**
 * AITargetingHelper — Suggestions de ciblage audience IA
 * AdsFacile Frontend
 * 
 * Bouton + Modal avec 3 propositions de ciblage
 * Intégré dans Step2Audience du wizard campagne
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Target, Loader2, X as XIcon, Users, DollarSign,
    Check, AlertTriangle, Zap, Sparkles
} from 'lucide-react';
import api from '../../services/api';
import './AIComponents.css';

const AITargetingHelper = ({ niche = '', city = '', budget = 5000, onApplyStrategy }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [strategies, setStrategies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [applied, setApplied] = useState(null);

    const handleOpen = async () => {
        setIsOpen(true);
        if (strategies.length === 0 && !loading) {
            await fetchStrategies();
        }
    };

    const fetchStrategies = async () => {
        setLoading(true);
        setError('');

        try {
            const res = await api.post('/ai/targeting', {
                niche: niche || 'Autre',
                city: city || 'Douala',
                budget: budget || 5000
            });

            if (res.data.success) {
                setStrategies(res.data.strategies || []);
            } else if (res.data.error === 'credits_exhausted') {
                setError(res.data.message);
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Erreur lors de la génération du ciblage';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = (strategy) => {
        setApplied(strategy.strategy_name);
        if (onApplyStrategy) {
            onApplyStrategy(strategy);
        }
        setTimeout(() => setIsOpen(false), 800);
    };

    const getGenderLabel = (gender) => {
        switch (gender) {
            case 'male': return '👨 Hommes';
            case 'female': return '👩 Femmes';
            default: return '👥 Tous';
        }
    };

    return (
        <>
            {/* ─── Bouton déclencheur ─── */}
            <button className="ai-targeting-trigger" onClick={handleOpen}>
                <Sparkles size={16} />
                🎯 Suggérer une audience
            </button>

            {/* ─── Modal ─── */}
            {isOpen && (
                <div className="ai-modal-backdrop" onClick={() => setIsOpen(false)}>
                    <div className="ai-modal" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="ai-modal-header">
                            <div className="ai-modal-title">
                                <Target size={20} />
                                <h3>Suggestions de ciblage IA</h3>
                            </div>
                            <button className="ai-modal-close" onClick={() => setIsOpen(false)}>
                                <XIcon size={20} />
                            </button>
                        </div>

                        {/* Info */}
                        <div className="ai-modal-info">
                            <span>Secteur : <strong>{niche || 'Autre'}</strong></span>
                            <span>Ville : <strong>{city || 'Douala'}</strong></span>
                            <span>Budget : <strong>{(budget || 5000).toLocaleString()} FCFA/jour</strong></span>
                        </div>

                        {/* Contenu */}
                        <div className="ai-modal-body">
                            {loading && (
                                <div className="ai-modal-loading">
                                    <Loader2 size={32} className="ai-spin" />
                                    <p>Analyse du marché en cours...</p>
                                </div>
                            )}

                            {error && (
                                <div className="ai-error">
                                    <AlertTriangle size={16} />
                                    <span>{error}</span>
                                    {error.includes('épuisés') && (
                                        <Link to="/plans" className="ai-error-link">
                                            <Zap size={14} /> Passer PRO
                                        </Link>
                                    )}
                                </div>
                            )}

                            {!loading && !error && strategies.length > 0 && (
                                <div className="ai-strategies">
                                    {strategies.map((s, index) => (
                                        <div
                                            key={index}
                                            className={`ai-strategy-card ${applied === s.strategy_name ? 'applied' : ''}`}
                                        >
                                            <div className="ai-strategy-header">
                                                <h4>{s.strategy_name}</h4>
                                                <span className="ai-strategy-reach">{s.estimated_reach}</span>
                                            </div>

                                            <div className="ai-strategy-details">
                                                <div className="ai-strategy-row">
                                                    <Users size={14} />
                                                    <span>{s.age_min}-{s.age_max} ans • {getGenderLabel(s.gender)}</span>
                                                </div>
                                                <div className="ai-strategy-row">
                                                    <DollarSign size={14} />
                                                    <span>{(s.recommended_budget || budget).toLocaleString()} FCFA/jour recommandé</span>
                                                </div>
                                            </div>

                                            {/* Intérêts */}
                                            <div className="ai-strategy-tags">
                                                {(s.interests || []).map((interest, i) => (
                                                    <span key={i} className="ai-tag interest">{interest}</span>
                                                ))}
                                                {(s.behaviors || []).map((behavior, i) => (
                                                    <span key={i} className="ai-tag behavior">{behavior}</span>
                                                ))}
                                            </div>

                                            <p className="ai-strategy-why">{s.why_this_works}</p>

                                            <button
                                                className={`ai-apply-btn ${applied === s.strategy_name ? 'applied' : ''}`}
                                                onClick={() => handleApply(s)}
                                                disabled={applied === s.strategy_name}
                                            >
                                                {applied === s.strategy_name ? (
                                                    <><Check size={14} /> Appliqué !</>
                                                ) : (
                                                    <>Appliquer ce ciblage</>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Régénérer */}
                            {!loading && strategies.length > 0 && (
                                <button className="ai-regenerate-btn" onClick={fetchStrategies}>
                                    <Sparkles size={14} />
                                    Régénérer les suggestions
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AITargetingHelper;
