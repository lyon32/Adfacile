import api from '../../services/api';
import { checkFile, checkVideo, mediaKind, measureVideo } from '../../utils/mediaSpecs';

/**
 * Contrôle puis téléverse un média. Lève une Error au message lisible si le
 * fichier ne respecte pas les règles Meta — rien n'est envoyé dans ce cas.
 *
 * @param {File} file
 * @param {'image'|'video'|null} attendu  type imposé, ou null pour accepter les deux
 * @returns {Promise<{url, type, width, height, duration?}>}
 */
export async function uploadCreativeMedia(file, attendu = null) {
    const type = mediaKind(file.type);
    if (attendu && type !== attendu) {
        throw new Error(attendu === 'image' ? 'Choisissez une image JPG ou PNG.' : 'Choisissez une vidéo MP4 ou MOV.');
    }
    const [erreurFichier] = checkFile(file);
    if (erreurFichier) throw new Error(erreurFichier);

    let mesureVideo = null;
    if (type === 'video') {
        mesureVideo = await measureVideo(file);
        const [erreurVideo] = checkVideo(mesureVideo);
        if (erreurVideo) throw new Error(erreurVideo);
    }

    const formData = new FormData();
    formData.append('file', file);
    let response;
    try {
        response = await api.post('/campaigns/upload-media', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000
        });
    } catch (err) {
        // Surtout pas de repli sur URL.createObjectURL : une URL blob: est
        // inaccessible à Facebook, la publicité partirait sans visuel.
        throw new Error(err.response?.data?.message
            || 'Le téléversement a échoué. Vérifiez votre connexion et réessayez.');
    }

    const data = response.data;
    if (!data?.success || !data.url) throw new Error(data?.message || 'Le téléversement a échoué.');

    return mesureVideo
        ? { url: data.url, type: 'video', width: mesureVideo.width, height: mesureVideo.height, duration: mesureVideo.duration }
        : { url: data.url, type: 'image', width: data.width, height: data.height };
}
