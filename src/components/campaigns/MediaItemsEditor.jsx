/**
 * MediaItemsEditor — médias d'un carrousel ou du format « Plusieurs visuels ».
 *
 * Carrousel : chaque carte a son média, un titre (20), une description (18)
 * et un lien (lien principal par défaut). Ordre modifiable.
 * Plusieurs visuels : simple liste de 2 à 10 médias, images et vidéos mêlées.
 */

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Video } from 'lucide-react';
import { ACCEPT, LIMITS, carouselRatioWarning } from '../../utils/mediaSpecs';
import { uploadCreativeMedia } from './uploadCreativeMedia';

const MediaItemsEditor = ({ mediaType, items, onChange, defaultLink }) => {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);
    const isCarousel = mediaType === 'carousel';
    const [min, max] = LIMITS.items[mediaType];

    const ajouter = async (files) => {
        setError('');
        const place = max - items.length;
        const liste = Array.from(files || []).slice(0, place);
        if (liste.length === 0) return;
        setUploading(true);
        const ajoutes = [];
        try {
            for (const file of liste) {
                ajoutes.push(await uploadCreativeMedia(file));
            }
        } catch (err) {
            setError(`${err.message}`);
        } finally {
            if (ajoutes.length) onChange([...items, ...ajoutes]);
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const modifier = (i, champ, valeur) =>
        onChange(items.map((item, j) => (j === i ? { ...item, [champ]: valeur } : item)));

    const retirer = (i) => onChange(items.filter((_, j) => j !== i));

    const deplacer = (i, sens) => {
        const j = i + sens;
        if (j < 0 || j >= items.length) return;
        const copie = [...items];
        [copie[i], copie[j]] = [copie[j], copie[i]];
        onChange(copie);
    };

    return (
        <div className="media-items">
            <p className="creative-hint media-items-count" aria-live="polite">
                {items.length} / {max} médias
                {items.length < min && ` · encore ${min - items.length} au minimum`}
                {isCarousel && ' · images carrées 1080 × 1080 conseillées'}
            </p>

            <ol className="media-items-list">
                {items.map((item, i) => {
                    const avertissement = isCarousel && item.type === 'image' ? carouselRatioWarning(item) : null;
                    return (
                        <li key={`${item.url}-${i}`} className="media-item">
                            <div className="media-item-thumb">
                                {item.type === 'video'
                                    ? <video src={item.url} muted preload="metadata" />
                                    : <img src={item.url} alt={`Média ${i + 1}`} />}
                                {item.type === 'video' && (
                                    <span className="media-item-badge"><Video size={12} /> Vidéo</span>
                                )}
                            </div>

                            <div className="media-item-body">
                                <div className="media-item-head">
                                    <span className="media-item-rank">{isCarousel ? `Carte ${i + 1}` : `Média ${i + 1}`}</span>
                                    <div className="media-item-actions">
                                        <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0}
                                            aria-label={`Avancer le média ${i + 1}`}><ChevronLeft size={16} /></button>
                                        <button type="button" onClick={() => deplacer(i, 1)} disabled={i === items.length - 1}
                                            aria-label={`Reculer le média ${i + 1}`}><ChevronRight size={16} /></button>
                                        <button type="button" onClick={() => retirer(i)}
                                            aria-label={`Retirer le média ${i + 1}`}><Trash2 size={16} /></button>
                                    </div>
                                </div>

                                {avertissement && <p className="media-item-warning">{avertissement}</p>}

                                {isCarousel && (
                                    <>
                                        <input
                                            type="text"
                                            className="creative-input"
                                            maxLength={LIMITS.cardName}
                                            value={item.name || ''}
                                            onChange={(e) => modifier(i, 'name', e.target.value)}
                                            placeholder="Titre de la carte"
                                            aria-label={`Titre de la carte ${i + 1}`}
                                        />
                                        <p className="creative-char-count">{(item.name || '').length}/{LIMITS.cardName}</p>
                                        <input
                                            type="text"
                                            className="creative-input"
                                            maxLength={LIMITS.cardDescription}
                                            value={item.description || ''}
                                            onChange={(e) => modifier(i, 'description', e.target.value)}
                                            placeholder="Description"
                                            aria-label={`Description de la carte ${i + 1}`}
                                        />
                                        <p className="creative-char-count">{(item.description || '').length}/{LIMITS.cardDescription}</p>
                                        <input
                                            type="url"
                                            className="creative-input"
                                            value={item.link || ''}
                                            onChange={(e) => modifier(i, 'link', e.target.value)}
                                            placeholder={defaultLink || 'https://votre-site.com'}
                                            aria-label={`Lien de la carte ${i + 1}`}
                                        />
                                        <p className="creative-hint">Vide : le lien principal est utilisé.</p>
                                    </>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>

            {items.length < max && (
                <button
                    type="button"
                    className="creative-upload-zone media-items-add"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? (
                        <Loader2 size={28} className="creative-upload-spinner" />
                    ) : (
                        <>
                            <span className="creative-upload-text">
                                <Plus size={16} aria-hidden="true" /> <span className="highlight">Ajouter des médias</span>
                            </span>
                            <span className="creative-upload-hint">
                                JPG, PNG (600 px de large min., 30 Mo) · MP4, MOV (1 s min., 50 Mo)
                            </span>
                        </>
                    )}
                </button>
            )}
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT.any}
                onChange={(e) => ajouter(e.target.files)}
                className="creative-hidden"
            />
            {error && <p className="creative-error-msg" role="alert">{error}</p>}
        </div>
    );
};

export default MediaItemsEditor;
