/**
 * AITextGenerator — Générateur de textes publicitaires IA
 * AdsFacile Frontend
 * 
 * Intégré dans le wizard de création campagne (Étape 4 Creative)
 * Plan Gratuit : 3 crédits/mois
 * Plan PRO+ : Illimité
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Sparkles, Loader2, Copy, Check, ChevronDown,
    AlertTriangle, Zap, Lock
} from 'lucide-react';
import api from '../../services/api';
import './AIComponents.css';

const TONE_OPTIONS = [
    { value: 'friendly', label: '😊 Amical' },
    { value: 'professional', label: '💼 Professionnel' },
    { value: 'urgent', label: '⚡ Urgent' },
    { value: 'local', label: '🌍 Local (camerounais)' }
];

const AITextGenerator = ({ niche = '', city = '', onSelectVariation }) => {
    // ─── États ───
    const [credits, setCredits] = useState(null);
    const [loadingCredits, setLoadingCredits] = useState(true);
    const [product, setProduct] = useState('');
    const [audience, setAudience] = useState('');
    const [tone, setTone] = useState('friendly');
    const [variations, setVariations] = useState([]);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [copiedIndex, setCopiedIndex] = useState(null);

    // ─── Charger crédits au montage ───
    useEffect(() => {
        fetchCredits();
    }, []);

    const fetchCredits = async () => {
        try {
            setLoadingCredits(true);
            const res = await api.get('/ai/credits');
            if (res.data.success) {
                setCredits(res.data);
            }
        } catch (err) {
            console.error('Erreur chargement crédits:', err);
        } finally {
            setLoadingCredits(false);
        }
    };

    // ─── Générer les variations ───
    const handleGenerate = async () => {
        if (!product.trim()) {
            setError('Veuillez décrire votre produit ou service');
            return;
        }

        setError('');
        setGenerating(true);
        setVariations([]);

        try {
            const res = await api.post('/ai/generate-text', {
                product: product.trim(),
                niche: niche || 'Autre',
                audience: audience.trim() || 'Tous',
                tone,
                city: city || 'Douala'
            });

            if (res.data.success) {
                setVariations(res.data.variations || []);
                // Mettre à jour les crédits
                setCredits(prev => prev ? {
                    ...prev,
                    credits: res.data.credits_remaining
                } : prev);
            } else if (res.data.error === 'credits_exhausted') {
                setCredits(prev => prev ? { ...prev, credits: 0 } : prev);
                setError(res.data.message);
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Erreur lors de la génération';
            if (err.response?.status === 403) {
                setCredits(prev => prev ? { ...prev, credits: 0 } : prev);
            }
            setError(msg);
        } finally {
            setGenerating(false);
        }
    };

    // ─── Copier un texte ───
    const handleCopy = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    // ─── Calcul barre de progression ───
    const maxCredits = credits?.max_credits || 3;
    const currentCredits = credits?.credits ?? 0;
    const isUnlimited = credits?.unlimited || false;
    const progressPercent = isUnlimited ? 100 : Math.round((currentCredits / maxCredits) * 100);
    const creditsExhausted = !isUnlimited && currentCredits <= 0;

    // ─── Reset date ───
    const resetDate = credits?.reset_date
        ? new Date(credits.reset_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        : '1er du mois prochain';

    // ─── Loading crédits ───
    if (loadingCredits) {
        return (
            <div className="ai-generator ai-loading">
                <Loader2 size={24} className="ai-spin" />
                <span>Chargement IA...</span>
            </div>
        );
    }

    // ─── Crédits épuisés ───
    if (creditsExhausted && variations.length === 0) {
        return (
            <div className="ai-generator ai-exhausted">
                <div className="ai-exhausted-icon">
                    <AlertTriangle size={32} />
                </div>
                <h4>Crédits IA épuisés ce mois</h4>
                <p>Réinitialisation le {resetDate}</p>
                <Link to="/plans" className="ai-upgrade-btn">
                    <Zap size={16} />
                    Passer à PRO pour crédits illimités
                </Link>
            </div>
        );
    }

    return (
        <div className="ai-generator">
            {/* ─── Header avec crédits ─── */}
            <div className="ai-header">
                <div className="ai-title">
                    <Sparkles size={20} />
                    <h4>Générer avec IA</h4>
                </div>
                <div className="ai-credits-badge">
                    {isUnlimited ? (
                        <span className="credits-unlimited">∞ Illimité</span>
                    ) : (
                        <span>{currentCredits}/{maxCredits}</span>
                    )}
                </div>
            </div>

            {/* Barre de progression crédits */}
            {!isUnlimited && (
                <div className="ai-credits-bar">
                    <div
                        className="ai-credits-fill"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* ─── Formulaire ─── */}
            <div className="ai-form">
                <div className="ai-field">
                    <label htmlFor="ai-product">Produit / Service *</label>
                    <input
                        id="ai-product"
                        type="text"
                        value={product}
                        onChange={e => setProduct(e.target.value)}
                        placeholder="Ex: Poulet grillé livré à domicile"
                        maxLength={200}
                    />
                </div>

                <div className="ai-field">
                    <label htmlFor="ai-audience">Audience cible</label>
                    <input
                        id="ai-audience"
                        type="text"
                        value={audience}
                        onChange={e => setAudience(e.target.value)}
                        placeholder="Ex: Jeunes professionnels 25-35 ans"
                        maxLength={200}
                    />
                </div>

                <div className="ai-field ai-field-select">
                    <label htmlFor="ai-tone">Ton</label>
                    <div className="ai-select-wrap">
                        <select
                            id="ai-tone"
                            value={tone}
                            onChange={e => setTone(e.target.value)}
                        >
                            {TONE_OPTIONS.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                        <ChevronDown size={16} className="ai-select-icon" />
                    </div>
                </div>
            </div>

            {/* Erreur */}
            {error && (
                <div className="ai-error">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* ─── Bouton générer ─── */}
            <button
                className="ai-generate-btn"
                onClick={handleGenerate}
                disabled={generating || creditsExhausted}
            >
                {generating ? (
                    <>
                        <Loader2 size={18} className="ai-spin" />
                        Génération en cours...
                    </>
                ) : (
                    <>
                        <Sparkles size={18} />
                        Générer 3 variations
                    </>
                )}
            </button>

            {/* Info crédits */}
            {!isUnlimited && (
                <p className="ai-credits-info">
                    ℹ️ {maxCredits} générations gratuites/mois.
                    Besoin de plus ? <Link to="/plans">Plan PRO</Link>
                </p>
            )}

            {/* ─── Résultats — 3 variations ─── */}
            {variations.length > 0 && (
                <div className="ai-results">
                    <h4 className="ai-results-title">
                        <Sparkles size={16} />
                        3 variations générées
                    </h4>
                    <div className="ai-variations">
                        {variations.map((v, index) => (
                            <div key={index} className="ai-variation-card">
                                <div className="ai-variation-header">
                                    <span className="ai-variation-num">Variation {v.variation || index + 1}</span>
                                    <button
                                        className="ai-copy-btn"
                                        onClick={() => handleCopy(v.ad_text, index)}
                                        title="Copier le texte"
                                    >
                                        {copiedIndex === index ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>

                                <h5 className="ai-variation-headline">{v.headline}</h5>
                                <p className="ai-variation-text">{v.ad_text}</p>
                                <p className="ai-variation-desc">{v.description}</p>

                                <div className="ai-variation-meta">
                                    <span className="ai-cta-badge">{v.cta}</span>
                                    {v.emoji_used && (
                                        <span className="ai-emojis">{v.emoji_used.join(' ')}</span>
                                    )}
                                </div>

                                {v.target_keywords && (
                                    <div className="ai-keywords">
                                        {v.target_keywords.map((kw, i) => (
                                            <span key={i} className="ai-keyword">{kw}</span>
                                        ))}
                                    </div>
                                )}

                                {onSelectVariation && (
                                    <button
                                        className="ai-use-btn"
                                        onClick={() => onSelectVariation(v)}
                                    >
                                        <Check size={14} />
                                        Utiliser cette variation
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AITextGenerator;
