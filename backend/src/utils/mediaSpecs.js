/**
 * Règles Meta sur les médias publicitaires, vérifiées AVANT tout envoi.
 *
 * Sources officielles (guide des publicités Meta) :
 * - image fil d'actualité : JPG/PNG, 30 Mo max, 600 px de large min, ratios
 *   acceptés de 9:16 à 1.91:1 ;
 * - carrousel : 2 à 10 cartes, ratio 1:1 attendu (tolérance 3 %, Meta recadre
 *   au-delà), titre 20 caractères, description 18, lien obligatoire ;
 * - vidéo : 4 Go chez Meta, mais 50 Mo ici (Render gratuit, 512 Mo de RAM).
 *
 * Le front a son équivalent dans src/utils/mediaSpecs.js (ESM) : Render ne
 * déploie que backend/, le module ne peut pas être partagé. Garder les deux
 * alignés.
 */

const MO = 1024 * 1024;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'];
const IMAGE_MAX_BYTES = 30 * MO;
const VIDEO_MAX_BYTES = 50 * MO;
const IMAGE_MIN_WIDTH = 600;
const RATIO_MIN = 9 / 16;
const RATIO_MAX = 1.91;
const CAROUSEL_TOLERANCE = 0.03;
const MEDIA_COUNT = { carousel: [2, 10], flexible: [2, 10] };
const CARD_NAME_MAX = 20;
const CARD_DESCRIPTION_MAX = 18;

/**
 * @param {{width:number, height:number, size:number}} image
 * @param {'feed'|'carousel'} format
 * @returns {{errors: string[], warnings: string[]}}
 */
function checkImage({ width, height, size }, format = 'feed') {
    const errors = [];
    const warnings = [];

    if (size > IMAGE_MAX_BYTES) {
        errors.push('Image trop lourde : 30 Mo maximum.');
    }
    if (!width || width < IMAGE_MIN_WIDTH) {
        errors.push(`Image trop petite : ${IMAGE_MIN_WIDTH} px de large minimum (reçu ${width || 0} px).`);
    }
    const ratio = width && height ? width / height : 0;
    if (ratio && (ratio < RATIO_MIN - 0.01 || ratio > RATIO_MAX + 0.01)) {
        errors.push('Format d\'image non accepté par Meta : entre 9:16 (vertical) et 1.91:1 (paysage).');
    }
    if (format === 'carousel' && ratio && Math.abs(ratio - 1) > CAROUSEL_TOLERANCE) {
        warnings.push('Le carrousel attend des images carrées (1:1, conseillé 1080×1080) : Meta recadrera celle-ci.');
    }

    return { errors, warnings };
}

const isUrl = (v) => /^https?:\/\/\S+$/i.test(v || '');

/**
 * Contrôle la liste des médias d'un carrousel ou d'un format flexible.
 * @returns {string[]} erreurs
 */
function checkMediaItems(mediaType, items = []) {
    const limites = MEDIA_COUNT[mediaType];
    if (!limites) return [];
    const errors = [];
    const [min, max] = limites;
    const nom = mediaType === 'carousel' ? 'Le carrousel' : 'Le format « Plusieurs visuels »';

    if (!Array.isArray(items) || items.length < min || items.length > max) {
        errors.push(`${nom} demande de ${min} à ${max} médias (reçu ${items?.length || 0}).`);
        return errors;
    }

    items.forEach((item, i) => {
        const rang = `Média ${i + 1}`;
        if (!isUrl(item.url)) errors.push(`${rang} : le fichier n'a pas été téléversé.`);
        if (item.type !== 'image' && item.type !== 'video') errors.push(`${rang} : type de média inconnu.`);
        if (mediaType !== 'carousel') return;
        if (item.link && !isUrl(item.link)) errors.push(`Carte ${i + 1} : le lien doit commencer par http:// ou https://.`);
        if ((item.name || '').length > CARD_NAME_MAX) errors.push(`Carte ${i + 1} : titre de ${CARD_NAME_MAX} caractères maximum.`);
        if ((item.description || '').length > CARD_DESCRIPTION_MAX) {
            errors.push(`Carte ${i + 1} : description de ${CARD_DESCRIPTION_MAX} caractères maximum.`);
        }
    });

    return errors;
}

module.exports = {
    ALLOWED_MIME,
    IMAGE_MAX_BYTES,
    VIDEO_MAX_BYTES,
    checkImage,
    checkMediaItems
};
