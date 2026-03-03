/**
 * AdCreativeForm — Étape 3 du wizard
 * Création de la publicité : IA, upload média, textes, CTA, preview
 * Layout 2 colonnes : gauche = formulaire, droite = preview live
 */

import { useState, useRef } from 'react';
import {
    Image, Video, Upload, Link, ChevronLeft, Check, Loader2,
    Sparkles, X
} from 'lucide-react';
import AITextGenerator from '../ai/AITextGenerator';
import CampaignPreview from './CampaignPreview';
import api from '../../services/api';

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

            // Upload to backend (which uploads to Supabase Storage)
            const response = await api.post('/campaigns/upload-media', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000
            });

            if (response.data.success) {
                updateCreative('media_url', response.data.url);
            }
        } catch (err) {
            // Fallback: create a local preview URL
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
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
                Créez votre publicité
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-9 gap-6">
                {/* LEFT — Form (5/9) */}
                <div className="lg:col-span-5 space-y-6">

                    {/* === AI GENERATION === */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <button
                            onClick={() => setShowAI(!showAI)}
                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                                    <Sparkles size={16} className="text-white" />
                                </div>
                                <span className="font-semibold text-gray-900">Générer avec l'IA</span>
                                <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full font-medium">
                                    ✨ IA
                                </span>
                            </div>
                            <svg
                                className={`w-5 h-5 text-gray-400 transition-transform ${showAI ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {showAI && (
                            <div className="px-6 pb-6 border-t border-gray-100">
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
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-sm text-gray-400">ou créez manuellement</span>
                        <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* === CREATIVE FORM === */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">

                        {/* Media type tabs */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Format média</label>
                            <div className="flex border border-gray-200 rounded-lg overflow-hidden w-fit">
                                {[
                                    { value: 'image', icon: Image, label: 'Image' },
                                    { value: 'video', icon: Video, label: 'Vidéo' }
                                ].map(opt => {
                                    const Icon = opt.icon;
                                    const isActive = creative.media_type === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                updateCreative('media_type', opt.value);
                                                updateCreative('media_url', '');
                                            }}
                                            className={`
                        flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors
                        ${isActive ? 'bg-emerald-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}
                      `}
                                        >
                                            <Icon size={16} />
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Upload zone */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {creative.media_type === 'image' ? 'Image' : 'Vidéo'} <span className="text-red-500">*</span>
                            </label>
                            {creative.media_url ? (
                                <div className="relative rounded-lg overflow-hidden border border-gray-200">
                                    {creative.media_type === 'image' ? (
                                        <img src={creative.media_url} alt="Preview" className="w-full h-48 object-cover" />
                                    ) : (
                                        <video src={creative.media_url} className="w-full h-48 object-cover" controls />
                                    )}
                                    <button
                                        onClick={() => updateCreative('media_url', '')}
                                        className="absolute top-2 right-2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
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
                                    className={`
                    flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                    ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
                  `}
                                >
                                    {uploading ? (
                                        <Loader2 size={32} className="text-emerald-500 animate-spin" />
                                    ) : (
                                        <>
                                            <Upload size={32} className="text-gray-400" />
                                            <p className="text-sm text-gray-500">
                                                Glissez-déposez ou <span className="text-emerald-500 font-medium">cliquez pour sélectionner</span>
                                            </p>
                                            <p className="text-xs text-gray-400">
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
                                className="hidden"
                            />
                        </div>

                        {/* Text fields */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Texte <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={4}
                                maxLength={500}
                                value={creative.message}
                                onChange={(e) => updateCreative('message', e.target.value)}
                                placeholder="Parlez de votre produit ou service..."
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm resize-none transition-colors"
                            />
                            <p className="text-xs text-gray-400 text-right">{creative.message.length}/500</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Titre <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                maxLength={40}
                                value={creative.headline}
                                onChange={(e) => updateCreative('headline', e.target.value)}
                                placeholder="Titre accrocheur"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm transition-colors"
                            />
                            <p className="text-xs text-gray-400 text-right">{creative.headline.length}/40</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <input
                                type="text"
                                maxLength={90}
                                value={creative.description}
                                onChange={(e) => updateCreative('description', e.target.value)}
                                placeholder="Description courte"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm transition-colors"
                            />
                            <p className="text-xs text-gray-400 text-right">{creative.description.length}/90</p>
                        </div>

                        {/* CTA */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Bouton d'action
                            </label>
                            <select
                                value={creative.call_to_action}
                                onChange={(e) => updateCreative('call_to_action', e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 outline-none text-sm"
                            >
                                {CTA_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* URL */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Link size={14} className="inline mr-1" />
                                Lien <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="url"
                                value={creative.link}
                                onChange={(e) => updateCreative('link', e.target.value)}
                                placeholder="https://exemple.com"
                                className={`w-full px-4 py-3 rounded-lg border outline-none text-sm transition-colors ${creative.link && !isValidURL(creative.link)
                                        ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                                        : 'border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
                                    }`}
                            />
                            {creative.link && !isValidURL(creative.link) && (
                                <p className="text-xs text-red-500 mt-1">L'URL doit commencer par https://</p>
                            )}
                        </div>

                        {/* Display link */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Lien d'affichage <span className="text-xs text-gray-400">(optionnel)</span>
                            </label>
                            <input
                                type="text"
                                value={creative.display_link}
                                onChange={(e) => updateCreative('display_link', e.target.value)}
                                placeholder="exemple.com/promo"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm transition-colors"
                            />
                            <p className="text-xs text-gray-400 mt-1">Affiché sous le titre</p>
                        </div>
                    </div>

                    {/* Ad Name */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nom de la publicité <span className="text-xs text-gray-400">(uniquement visible pour vous)</span>
                        </label>
                        <input
                            type="text"
                            value={ad_name}
                            onChange={(e) => updateField('ad_name', e.target.value)}
                            placeholder="Ex: Pub Promo Mars - Douala"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm transition-colors"
                        />
                    </div>
                </div>

                {/* RIGHT — Preview (4/9) */}
                <div className="lg:col-span-4">
                    <div className="lg:sticky lg:top-24">
                        <p className="text-sm font-medium text-gray-500 mb-3">Aperçu en direct</p>
                        <CampaignPreview creative={creative} user={user} />
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
                <button
                    onClick={onPrev}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                >
                    <ChevronLeft size={18} />
                    Précédent
                </button>
                <button
                    onClick={onSubmit}
                    disabled={!isValid || isSubmitting}
                    className={`
            flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200
            ${isValid && !isSubmitting
                            ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200'
                            : 'bg-gray-300 cursor-not-allowed'
                        }
          `}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
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
