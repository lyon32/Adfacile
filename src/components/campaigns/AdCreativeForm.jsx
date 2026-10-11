/**
 * AdCreativeForm — Étape 3 du wizard
 * Création de la publicité : IA, upload média, textes, CTA, preview
 * Layout 2 colonnes : gauche = formulaire, droite = preview live
 */

import { useState, useRef, useEffect } from 'react';
import {
    Upload, ChevronLeft, Check, Loader2,
    Sparkles, X, Palette
} from 'lucide-react';
import AITextGenerator from '../ai/AITextGenerator';
import CampaignPreview from './CampaignPreview';
import MediaItemsEditor from './MediaItemsEditor';
import { uploadCreativeMedia } from './uploadCreativeMedia';
import { ACCEPT, LIMITS, MEDIA_FORMATS, checkMediaItems } from '../../utils/mediaSpecs';
import '../../styles/ad-creative-form.css';

// Boutons proposés pour une destination site web. SEND_MESSAGE en est exclu :
// associé à une destination site web, il reproduit exactement l'erreur #1815675
// (« publicité non-Messenger dans un ensemble Messenger »). En messagerie, le
// bouton est imposé par la destination et n'est pas choisi ici.
const CTA_OPTIONS = [
    { value: 'LEARN_MORE', label: 'En savoir plus' },
    { value: 'SHOP_NOW', label: 'Acheter maintenant' },
    { value: 'SIGN_UP', label: "S'inscrire" },
    { value: 'CONTACT_US', label: 'Nous contacter' },
    { value: 'DOWNLOAD', label: 'Télécharger' },
    { value: 'BOOK_NOW', label: 'Réserver' },
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

const AdCreativeForm = ({ campaignData, setCampaignData, user, onPrev, onSubmit, isSubmitting, progressLabel = '' }) => {
    const [showAI, setShowAI] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploadError, setUploadError] = useState('');
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

    // Média unique (image ou vidéo) : contrôlé avant l'envoi, refus affiché
    // sous la zone de dépôt.
    const handleFileUpload = async (file) => {
        if (!file) return;
        setUploadError('');
        setUploading(true);
        try {
            const media = await uploadCreativeMedia(file, creative.media_type);
            updateCreative('media_url', media.url);
        } catch (err) {
            setUploadError(err.message);
            updateCreative('media_url', '');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const isMulti = creative.media_type === 'carousel' || creative.media_type === 'flexible';
    const mediaItems = creative.media_items || [];

    const choisirFormat = (format) => {
        setUploadError('');
        setCampaignData(prev => ({
            ...prev,
            creative: { ...prev.creative, media_type: format, media_url: '', media_items: [] }
        }));
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

    // ───────────────────────────────────────────────────────────────────
    // La publicité dépend de la destination choisie à l'étape 2
    //
    // Cette étape ignorait totalement l'objectif et la destination : elle
    // exigeait une URL même pour une conversation — URL que le backend jette
    // ensuite — et un titre que Meta ne réclame pas en messagerie.
    // ───────────────────────────────────────────────────────────────────
    const versMessagerie = (campaignData.messaging_destinations?.length > 0)
        || ['MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT'].includes(campaignData.destination_type);

    // L'URL est saisie une seule fois, à l'étape 2. On la reprend ici plutôt
    // que de la redemander : deux champs pour la même chose finissaient par
    // diverger, et c'est celui-ci qui l'emportait en silence.
    useEffect(() => {
        if (!versMessagerie && !creative.link && campaignData.website_url) {
            updateCreative('link', campaignData.website_url);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versMessagerie, campaignData.website_url]);

    // Validation — alignée sur la règle que le backend applique déjà.
    const mediaOk = isMulti
        ? checkMediaItems(creative.media_type, mediaItems).length === 0
        : Boolean(creative.media_url);
    const isValid = mediaOk &&
        creative.message.length > 0 &&
        (versMessagerie || creative.headline.length > 0) &&
        (versMessagerie || (creative.link && isValidURL(creative.link)));

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

                        {/* Format */}
                        <div className="creative-field-group">
                            <span className="creative-label" id="media-format-label">Format</span>
                            <div className="creative-media-tabs" role="radiogroup" aria-labelledby="media-format-label">
                                {MEDIA_FORMATS.map(opt => {
                                    const isActive = creative.media_type === opt.value;
                                    return (
                                        <button
                                            type="button"
                                            key={opt.value}
                                            role="radio"
                                            aria-checked={isActive}
                                            onClick={() => choisirFormat(opt.value)}
                                            className={`creative-media-tab ${isActive ? 'active' : ''}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="creative-hint">
                                {MEDIA_FORMATS.find(f => f.value === creative.media_type)?.hint}
                            </p>
                        </div>

                        {isMulti ? (
                            <div className="creative-field-group">
                                <span className="creative-label">
                                    {creative.media_type === 'carousel' ? 'Cartes' : 'Visuels'} <span className="required">*</span>
                                </span>
                                <MediaItemsEditor
                                    mediaType={creative.media_type}
                                    items={mediaItems}
                                    onChange={(liste) => updateCreative('media_items', liste)}
                                    defaultLink={creative.link}
                                />
                            </div>
                        ) : (
                        <div className="creative-field-group">
                            <label className="creative-label">
                                {creative.media_type === 'image' ? 'Image' : 'Vidéo'} <span className="required">*</span>
                            </label>
                            {creative.media_url ? (
                                <div className="creative-media-preview">
                                    {creative.media_type === 'image' ? (
                                        <img src={creative.media_url} alt="Visuel de la publicité" />
                                    ) : (
                                        <video src={creative.media_url} controls />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => updateCreative('media_url', '')}
                                        className="creative-media-remove"
                                        aria-label="Retirer le média"
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
                                                    ? 'JPG, PNG · 600 px de large min. · 30 Mo max. · 4:5 conseillé (1440 × 1800)'
                                                    : 'MP4, MOV · 1 s min. · 50 Mo max. · H.264 conseillé'
                                                }
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={ACCEPT[creative.media_type] || ACCEPT.image}
                                onChange={(e) => handleFileUpload(e.target.files[0])}
                                className="creative-hidden"
                            />
                            {uploadError && <p className="creative-error-msg" role="alert">{uploadError}</p>}
                        </div>
                        )}

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
                                Titre {versMessagerie
                                    ? <span className="optional">(optionnel)</span>
                                    : <span className="required">*</span>}
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

                        {creative.media_type === 'flexible' && (
                            <div className="creative-field-group">
                                <label className="creative-label" htmlFor="flexible-bodies">
                                    Autres textes et titres <span className="optional">(optionnel)</span>
                                </label>
                                <textarea
                                    id="flexible-bodies"
                                    rows={3}
                                    value={(creative.bodies || []).join('\n')}
                                    onChange={(e) => updateCreative('bodies',
                                        e.target.value.split('\n').slice(0, LIMITS.flexibleTexts - 1))}
                                    placeholder="Un autre texte principal par ligne"
                                    className="creative-textarea"
                                />
                                <textarea
                                    rows={2}
                                    value={(creative.titles || []).join('\n')}
                                    onChange={(e) => updateCreative('titles',
                                        e.target.value.split('\n').slice(0, LIMITS.flexibleTexts - 1))}
                                    placeholder="Un autre titre par ligne"
                                    className="creative-textarea media-items-titles"
                                    aria-label="Autres titres"
                                />
                                <p className="creative-hint">
                                    Jusqu’à 5 textes et 5 titres au total : Meta teste les combinaisons.
                                </p>
                            </div>
                        )}

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
                            {versMessagerie ? (
                                /* Le bouton est imposé par la destination. Laisser le
                                   choix ouvert affichait dans l'aperçu un bouton qui
                                   n'était pas celui diffusé. */
                                <>
                                    <div className="creative-input" style={{ background: 'var(--color-bg-alt)' }}>
                                        Envoyer un message
                                    </div>
                                    <p className="creative-hint">
                                        Déterminé par la messagerie choisie à l'étape précédente.
                                    </p>
                                </>
                            ) : campaignData.destination_type === 'PHONE_CALL' ? (
                                /* Publicité d'appel : Meta impose « Appeler » vers le
                                   numéro saisi à l'étape 2 ; un autre choix ici
                                   serait ignoré. */
                                <>
                                    <div className="creative-input" style={{ background: 'var(--color-bg-alt)' }}>
                                        Appeler{campaignData.phone_number ? ` · ${campaignData.phone_number}` : ''}
                                    </div>
                                    <p className="creative-hint">
                                        Compose le numéro indiqué à l’étape précédente.
                                    </p>
                                </>
                            ) : (
                                <select
                                    value={creative.call_to_action}
                                    onChange={(e) => updateCreative('call_to_action', e.target.value)}
                                    className="creative-select"
                                >
                                    {CTA_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Message d'accueil de la conversation */}
                        {versMessagerie && (
                            <div className="creative-field-group">
                                <label className="creative-label">
                                    Message d'accueil <span className="optional">(optionnel)</span>
                                </label>
                                <textarea
                                    rows={2}
                                    maxLength={160}
                                    value={creative.welcome_message || ''}
                                    onChange={(e) => updateCreative('welcome_message', e.target.value)}
                                    placeholder="Bonjour ! Dites-nous comment nous pouvons vous aider."
                                    className="creative-input"
                                />
                                <p className="creative-hint">
                                    La première chose que verra la personne en ouvrant la conversation.
                                    Sans message, Facebook en affiche un générique.
                                </p>
                            </div>
                        )}

                        {/* URL — sans objet en messagerie : Facebook redirige vers la
                            conversation, et le backend ignore ce champ. */}
                        {!versMessagerie && (
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
                                <p className="creative-error-msg">
                                    L'adresse doit commencer par http:// ou https://
                                </p>
                            )}
                            <p className="creative-hint">Repris de l'étape précédente, modifiable ici.</p>
                        </div>
                        )}

                        {/* Display link */}
                        {!versMessagerie && (
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
                        )}

                        {/* Paramètres d'URL — pour mesurer d'où vient le trafic */}
                        {!versMessagerie && (
                            <div className="creative-field-group">
                                <label className="creative-label">
                                    Paramètres de suivi <span className="optional">(optionnel)</span>
                                </label>
                                <input
                                    type="text"
                                    value={creative.url_tags || ''}
                                    onChange={(e) => updateCreative('url_tags', e.target.value)}
                                    placeholder="utm_source=facebook&utm_medium=cpc"
                                    className="creative-input"
                                />
                                <p className="creative-hint">
                                    Ajoutés à votre lien pour reconnaître ces visiteurs dans vos statistiques.
                                </p>
                            </div>
                        )}

                        {/* Publicités multi-annonceurs — Meta y inscrit d'office toute
                            publicité qui ne précise rien. Le choix devient visible. */}
                        <div className="creative-field-group">
                            <label className="messaging-app" style={{ alignItems: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    className="messaging-app-checkbox"
                                    checked={campaignData.multi_advertiser_ads !== false}
                                    onChange={(e) => updateField('multi_advertiser_ads', e.target.checked)}
                                />
                                <span className="dest-content">
                                    <span className="dest-label">Publicités multi-annonceurs</span>
                                    <span className="dest-desc">
                                        Votre publicité peut apparaître avec d'autres dans la même unité
                                        publicitaire afin d'améliorer sa visibilité. Le contenu publicitaire
                                        peut être redimensionné ou recadré.
                                    </span>
                                </span>
                            </label>
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
                    aria-live="polite"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 size={18} className="spinner" />
                            {progressLabel || 'Création en cours…'}
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
