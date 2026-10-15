// Ré-encodage des images envoyées (SECURITY_NOTES §3.3, TR-SEC-08) avec `sharp` (libvips) :
//  - les dimensions sont lues dans l'en-tête AVANT tout décodage : plus de 40 mégapixels → refus (une petite image
//    peut se décompresser en une énorme) ;
//  - l'image est décodée puis réécrite : métadonnées EXIF (position GPS comprise), profil ICC, commentaires et
//    octets ajoutés après la fin de l'image (charge cachée) ne survivent pas (`sharp` n'écrit aucune métadonnée par défaut) ;
//  - l'orientation EXIF est appliquée avant d'être supprimée, et le plus grand côté est ramené à 2 048 px
//    (une photo de téléphone n'a pas besoin de plus pour l'Analyste, et coûte moins de jetons) ;
//  - le format reste celui détecté sur les premiers octets.
// Documentation : https://sharp.pixelplumbing.com/api-output#withmetadata , https://sharp.pixelplumbing.com/api-constructor
import { AppError } from '@pubeka/contracts';
import type { ImageProcessor } from '@pubeka/core';
import sharp from 'sharp';

export const MAX_PIXELS = 40_000_000;
export const MAX_SIDE = 2048;

function refused(reason: string, cause?: unknown): AppError {
  return new AppError('unsupported_file_type', {
    meta: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

export const sharpImageProcessor: ImageProcessor = {
  async reencode(bytes, mime) {
    try {
      const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
      const meta = await image.metadata();
      const pixels = meta.width * meta.height;
      if (!Number.isFinite(pixels) || pixels <= 0) throw refused('no_dimensions');
      if (pixels > MAX_PIXELS) throw refused('too_many_pixels');
      const pipeline = image
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
      const out =
        mime === 'image/png'
          ? pipeline.png({ compressionLevel: 9 })
          : mime === 'image/jpeg'
            ? pipeline.jpeg({ quality: 88, mozjpeg: true })
            : pipeline.webp({ quality: 88 });
      const buffer = await out.toBuffer();
      return { bytes: new Uint8Array(buffer), mime };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw refused('image_unreadable', error);
    }
  },
};
