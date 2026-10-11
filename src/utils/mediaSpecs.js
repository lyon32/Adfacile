/**
 * Règles Meta sur les médias publicitaires, vérifiées dans le navigateur avant
 * l'envoi. Équivalent serveur : backend/src/utils/mediaSpecs.js (Render ne
 * déploie que backend/, le module ne peut pas être partagé) — garder alignés.
 *
 * La vidéo n'est mesurée qu'ici (pas de ffmpeg sur le serveur) ; Meta la
 * revalide de toute façon pendant son traitement.
 */

const MO = 1024 * 1024;

export const MEDIA_FORMATS = [
    { value: 'image', label: 'Image', hint: 'Une seule image' },
    { value: 'video', label: 'Vidéo', hint: 'Une seule vidéo' },
    { value: 'carousel', label: 'Carrousel', hint: '2 à 10 cartes qui défilent' },
    { value: 'flexible', label: 'Plusieurs visuels', hint: 'Meta choisit la meilleure combinaison' }
];

export const LIMITS = {
    imageMaxBytes: 30 * MO,
    videoMaxBytes: 50 * MO,
    imageMinWidth: 600,
    videoMinSide: 120,
    videoMinSeconds: 1,
    videoMaxSeconds: 241 * 60,
    items: { carousel: [2, 10], flexible: [2, 10] },
    cardName: 20,
    cardDescription: 18,
    flexibleTexts: 5
};

export const ACCEPT = {
    image: '.jpg,.jpeg,.png',
    video: '.mp4,.mov',
    any: '.jpg,.jpeg,.png,.mp4,.mov'
};

const IMAGE_MIME = ['image/jpeg', 'image/png'];
const VIDEO_MIME = ['video/mp4', 'video/quicktime'];

/** Type d'un fichier (« image » / « video ») ou null s'il n'est pas accepté. */
export function mediaKind(mime) {
    if (IMAGE_MIME.includes(mime)) return 'image';
    if (VIDEO_MIME.includes(mime)) return 'video';
    return null;
}

/** Contrôles possibles avant l'envoi, sur le seul fichier. */
export function checkFile({ type, size }) {
    const kind = mediaKind(type);
    if (!kind) return ['Format non accepté : JPG, PNG, MP4 ou MOV uniquement.'];
    if (kind === 'image' && size > LIMITS.imageMaxBytes) return ['Image trop lourde : 30 Mo maximum.'];
    if (kind === 'video' && size > LIMITS.videoMaxBytes) return ['Vidéo trop lourde : 50 Mo maximum.'];
    return [];
}

/** Contrôle d'une vidéo mesurée dans le navigateur. */
export function checkVideo({ duration, width, height }) {
    const errors = [];
    if (!(duration >= LIMITS.videoMinSeconds)) {
        errors.push('Vidéo trop courte : 1 seconde minimum.');
    } else if (duration > LIMITS.videoMaxSeconds) {
        errors.push('Vidéo trop longue : 241 minutes maximum.');
    }
    if (!(width >= LIMITS.videoMinSide) || !(height >= LIMITS.videoMinSide)) {
        errors.push('Vidéo trop petite : 120 × 120 px minimum.');
    }
    return errors;
}

/** Avertissement (pas un refus) : le carrousel attend du 1:1 à 3 % près. */
export function carouselRatioWarning({ width, height }) {
    if (!width || !height) return null;
    return Math.abs(width / height - 1) > 0.03
        ? 'Pas carrée : Meta recadrera cette carte en 1:1.'
        : null;
}

const isUrl = (v) => /^https?:\/\/\S+$/i.test(v || '');

/** Erreurs bloquantes sur la liste des médias d'un carrousel ou d'un format flexible. */
export function checkMediaItems(mediaType, items = []) {
    const limites = LIMITS.items[mediaType];
    if (!limites) return [];
    const [min, max] = limites;
    const nom = mediaType === 'carousel' ? 'Le carrousel' : 'Le format « Plusieurs visuels »';
    if (items.length < min || items.length > max) {
        return [`${nom} demande de ${min} à ${max} médias (${items.length} pour l’instant).`];
    }
    const errors = [];
    items.forEach((item, i) => {
        if (!isUrl(item.url)) errors.push(`Média ${i + 1} : fichier manquant.`);
        if (mediaType !== 'carousel') return;
        if (item.link && !isUrl(item.link)) errors.push(`Carte ${i + 1} : le lien doit commencer par https://.`);
        if ((item.name || '').length > LIMITS.cardName) errors.push(`Carte ${i + 1} : titre de 20 caractères maximum.`);
        if ((item.description || '').length > LIMITS.cardDescription) errors.push(`Carte ${i + 1} : description de 18 caractères maximum.`);
    });
    return errors;
}

/** Mesure une vidéo locale (durée, dimensions) sans l'envoyer. Navigateur uniquement. */
export function measureVideo(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const mesure = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
            URL.revokeObjectURL(url);
            resolve(mesure);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Vidéo illisible : utilisez un MP4 (H.264) ou un MOV.'));
        };
        video.src = url;
    });
}
