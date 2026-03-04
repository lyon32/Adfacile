/**
 * AdCreativeForm — Étape 3 du wizard
 * Création de la publicité : IA, upload média, textes, CTA, preview
 * Layout 2 colonnes : gauche = formulaire, droite = preview live
 */

import { useState, useRef } from 'react';
import {
    Image, Video, Upload, Link, ChevronLeft, Check, Loader2,
    Sparkles, X, Palette
} from 'lucide-react';
import AITextGenerator from '../ai/AITextGenerator';
import CampaignPreview from './CampaignPreview';
import api from '../../services/api';
import '../../styles/ad-creative-form.css';

const CTA_OPTIONS = [
    { value: 'LEARN_MORE', label: 'En savoir plus' },
    { value: 'SHOP_NOW', label: 'Acheter maintenant' },
    { value: 'SIGN_UP', label: "S'inscrire" },
    { value: 'CONTACT_US', label: 'Nous contacter' },
    { value: 'DOWNLOAD', label: 'Télécharger' },
    { value: 'BOOK_NOW', label: 'Réserver' },
    { value: 'SEND_MESSAGE', label: 'Envoyer un message' }
];

function mapCTAtoFacebook(cta) {
    const map = {
        'En savoir plus': 'LEARN_MORE',
        'Acheter maintenant': 'SHOP_NOW',
        "S'inscrire": 'SIGN_UP',
        'Nous contacter': 'CONTACT_US'
    };
    return map[cta] || 'LEARN_MORE';
}

const AdCreativeForm = ({ campaignData, setCampaignData, user, onPrev, onSubmit, isSubmitting }) => {
    const [showAI, setShowAI] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const { creative, ad_name } = campaignData;

    const updateCreative = (field, value) => {
        setCampaignData(prev => ({
            ...prev,
            creative: { ...prev.creative, [field]: value }
        }));
    };

    const updateField = (field, value) => {
        setCampaignData(prev => ({ ...prev, [field]: value }));
    };

    // Handle file upload
    const handleFileUpload = async (file) => {
        if (!file) return;

        const isImage = creative.media_type === 'image';
        const maxSize = isImage ? 5 * 1024 * 1024 : 50 * 1024 * 1024;
        const allowedTypes = isImage
            ? ['image/jpeg', 'image/jpg', 'image/png']
            : ['video/mp4', 'video/quicktime'];

        if (!allowedTypes.includes(file.type)) {
            alert(`Format non supporté. ${isImage ? 'Utilisez JPG ou PNG.' : 'Utilisez MP4 ou MOV.'}`);
            return;
        }

        if (file.size > maxSize) {
            alert(`Fichier trop volumineux. Maximum ${isImage ? '5 MB' : '50 MB'}.`);
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', creative.media_type);

            const response = await api.post('/campaigns/upload-media', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000
            });

            if (response.data.success) {
                updateCreative('media_url', response.data.url);
            }
        } catch (err) {
            const localUrl = URL.createObjectURL(file);
            updateCreative('media_url', localUrl);
            console.warn('Upload failed, using local preview:', err);
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const isValidURL = (url) => {
        try {
            new URL(url);
            return url.startsWith('https://') || url.startsWith('http://');
        } catch {
            return false;
        }
    };

    // Validation
    const isValid = creative.media_url &&
        creative.message.length > 0 &&
        creative.headline.length > 0 &&
        creative.link &&
        isValidURL(creative.link);

    return (
        <div>
            <h2 className="creative-page-title">
                Créez votre publicité
            </h2>

            <div className="creative-grid">
                {/* LEFT — Form */}
                <div className="creative-left">

                    {/* === AI GENERATION === */}
                    <div className="creative-ai-card">
                        <button
                            onClick={() => setShowAI(!showAI)}
                            className="creative-ai-trigger"
                        >
                            <div className="creative-ai-trigger-left">
                                <div className="creative-ai-icon">
                                    <Sparkles size={18} />
                                </div>
                                <span className="creative-ai-label">
                                    Générer avec l'IA
                                    <span className="creative-ai-badge">✨ IA</span>
                                </span>
                            </div>
                            <svg
                                className={`creative-ai-chevron ${showAI ? 'open' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {showAI && (
                            <div className="creative-ai-body">
                                <AITextGenerator
                                    niche={user?.business_niche || user?.niche || 'Autre'}
                                    city={campaignData.targeting?.locations?.[0] || 'Douala'}
                                    onSelectVariation={(variation) => {
                                        setCampaignData(prev => ({
                                            ...prev,
                                            creative: {
                                                ...prev.creative,
                                                message: variation.ad_text || variation.message || '',
                                                headline: variation.headline || '',
                                                description: variation.description || '',
                                                call_to_action: mapCTAtoFacebook(variation.cta || 'En savoir plus')
                                            }
                                        }));
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="creative-divider">
                        <div className="creative-divider-line" />
                        <span className="creative-divider-text">ou créez manuellement</span>
                        <div className="creative-divider-line" />
                    </div>

                    {/* === CREATIVE FORM === */}
                    <div className="creative-card">
                        <div className="creative-section-header">
                            <div className="creative-section-icon">
                                <Palette size={22} />
                            </div>
                            <div>
                                <h3 className="creative-section-title">Contenu publicitaire</h3>
                                <p className="creative-section-subtitle">Média, textes et appel à l'action</p>
                            </div>
                        </div>

                        {/* Media type tabs */}
                        <div className="creative-field-group">
                            <label className="creative-label">Format média</label>
                            <div className="creative-media-tabs">
                                {[
                                    { value: 'image', icon: Image, label: '📷 Image' },
                                    { value: 'video', icon: Video, label: '🎬 Vidéo' }
                                ].map(opt => {
                                    const isActive = creative.media_type === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                updateCreative('media_type', opt.value);
                                                updateCreative('media_url', '');
                                            }}
                                            className={`creative-media-tab ${isActive ? 'active' : ''}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Upload zone */}
                        <div className="creative-field-group">
                            <label className="creative-label">
                                {creative.media_type === 'image' ? 'Image' : 'Vidéo'} <span className="required">*</span>
                            </label>
                            {creative.media_url ? (
                                <div className="creative-media-preview">
                                    {creative.media_type === 'image' ? (
                                        <img src={creative.media_url} alt="Preview" />
                                    ) : (
                                        <video src={creative.media_url} controls />
                                    )}
                                    <button
                                        onClick={() => updateCreative('media_url', '')}
                                        className="creative-media-remove"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                    onDragLeave={() => setDragOver(false)}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`creative-upload-zone ${dragOver ? 'dragover' : ''}`}
                                >
                                    {uploading ? (
                                        <Loader2 size={36} className="creative-upload-spinner" />
                                    ) : (
                                        <>
                                            <div className="creative-upload-icon">
                                                <Upload size={26} />
                                            </div>
                                            <p className="creative-upload-text">
                                                Glissez-déposez ou <span className="highlight">cliquez pour sélectionner</span>
                                            </p>
                                            <p className="creative-upload-hint">
                                                {creative.media_type === 'image'
                                                    ? 'JPG, PNG • Max 5 MB • Ratio 1:1 ou 4:5 recommandé'
                                                    : 'MP4, MOV • Max 50 MB • 15-60s recommandé'
                                                }
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={creative.media_type === 'image' ? '.jpg,.jpeg,.png' : '.mp4,.mov'}
                                onChange={(e) => handleFileUpload(e.target.files[0])}
                                className="creative-hidden"
                            />
                        </div>

                        {/* Text fields */}
                        <div className="creative-field-group">
                            <label className="creative-label">
                                Texte principal <span className="required">*</span>
                            </label>
                            <textarea
                                rows={4}
                                maxLength={500}
                                value={creative.message}
                                onChange={(e) => updateCreative('message', e.target.value)}
                                placeholder="Parlez de votre produit ou service..."
                                className="creative-textarea"
                            />
                            <p className="creative-char-count">{creative.message.length}/500</p>
                        </div>

                        <div className="creative-field-group">
                            <label className="creative-label">
                                Titre <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                maxLength={40}
                                value={creative.headline}
                                onChange={(e) => updateCreative('headline', e.target.value)}
                                placeholder="Titre accrocheur"
                                className="creative-input"
                            />
                            <p className="creative-char-count">{creative.headline.length}/40</p>
                        </div>

                        <div className="creative-field-group">
                            <label className="creative-label">
                                Description <span className="optional">(optionnel)</span>
                            </label>
                            <input
                                type="text"
                                maxLength={90}
                                value={creative.description}
                                onChange={(e) => updateCreative('description', e.target.value)}
                                placeholder="Description courte sous le titre"
                                className="creative-input"
                            />
                            <p className="creative-char-count">{creative.description.length}/90</p>
                        </div>

                        {/* CTA */}
                        <div className="creative-field-group">
                            <label className="creative-label">Bouton d'action</label>
                            <select
                                value={creative.call_to_action}
                                onChange={(e) => updateCreative('call_to_action', e.target.value)}
                                className="creative-select"
                            >
                                {CTA_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* URL */}
                        <div className="creative-field-group">
                            <label className="creative-label">
                                🔗 Lien de destination <span className="required">*</span>
                            </label>
                            <input
                                type="url"
                                value={creative.link}
                                onChange={(e) => updateCreative('link', e.target.value)}
                                placeholder="https://votre-site.com"
                                className={`creative-input ${creative.link && !isValidURL(creative.link) ? 'error' : ''}`}
                            />
                            {creative.link && !isValidURL(creative.link) && (
                                <p className="creative-error-msg">L'URL doit commencer par https://</p>
                            )}
                        </div>

                        {/* Display link */}
                        <div className="creative-field-group">
                            <label className="creative-label">
                                Lien d'affichage <span className="optional">(optionnel)</span>
                            </label>
                            <input
                                type="text"
                                value={creative.display_link}
                                onChange={(e) => updateCreative('display_link', e.target.value)}
                                placeholder="exemple.com/promo"
                                className="creative-input"
                            />
                            <p className="creative-hint">Affiché sous le titre dans la publicité</p>
                        </div>
                    </div>

                    {/* Ad Name */}
                    <div className="creative-adname-card">
                        <label className="creative-label">
                            Nom de la publicité <span className="optional">(uniquement visible pour vous)</span>
                        </label>
                        <input
                            type="text"
                            value={ad_name}
                            onChange={(e) => updateField('ad_name', e.target.value)}
                            placeholder="Ex: Pub Promo Mars - Douala"
                            className="creative-input"
                        />
                    </div>
                </div>

                {/* RIGHT — Preview */}
                <div>
                    <div className="creative-preview-panel">
                        <div className="creative-preview-label">
                            <div className="creative-preview-dot" />
                            Aperçu en direct
                        </div>
                        <CampaignPreview creative={creative} user={user} />
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="creative-nav">
                <button onClick={onPrev} className="creative-btn-prev">
                    <ChevronLeft size={18} />
                    Précédent
                </button>
                <button
                    onClick={onSubmit}
                    disabled={!isValid || isSubmitting}
                    className="creative-btn-submit"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 size={18} className="spinner" />
                            Création en cours...
                        </>
                    ) : (
                        <>
                            <Check size={18} />
                            Créer la campagne
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default AdCreativeForm;
