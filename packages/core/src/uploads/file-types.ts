// Types de fichiers acceptés et leurs limites (SECURITY_NOTES §3.3, TR-SEC-08). Liste d'autorisation :
// tout ce qui n'y figure pas est refusé. Le type annoncé par le client n'est qu'une déclaration ;
// le vrai type est lu sur les premiers octets du fichier reçu (`sniffFileType`).
export const MIB = 1024 * 1024;

export const FILE_TYPES = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    kind: 'document',
  },
} as const;

export type FileMime = keyof typeof FILE_TYPES;
export type FileKind = (typeof FILE_TYPES)[FileMime]['kind'];

export const UPLOAD_PURPOSES = [
  'source',
  'reference',
  'brand_logo',
  'support_attachment',
  'payment_proof',
] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export type UploadBucket = 'sources' | 'brand' | 'support';

interface PurposeRule {
  bucket: UploadBucket;
  mimes: readonly FileMime[];
  /** Plafond propre au compartiment (migration 0002), appliqué avant la limite générale. */
  maxBytes: number;
}

const IMAGES: readonly FileMime[] = ['image/png', 'image/jpeg', 'image/webp'];
const ALL: readonly FileMime[] = [
  ...IMAGES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const PURPOSE_RULES: Record<UploadPurpose, PurposeRule> = {
  source: { bucket: 'sources', mimes: ALL, maxBytes: 20 * MIB },
  reference: { bucket: 'sources', mimes: IMAGES, maxBytes: 10 * MIB },
  brand_logo: { bucket: 'brand', mimes: IMAGES, maxBytes: 5 * MIB },
  support_attachment: { bucket: 'support', mimes: [...IMAGES, 'application/pdf'], maxBytes: 10 * MIB },
  payment_proof: { bucket: 'support', mimes: [...IMAGES, 'application/pdf'], maxBytes: 10 * MIB },
};

export function isFileMime(value: string): value is FileMime {
  return Object.hasOwn(FILE_TYPES, value);
}

/** Image : 10 Mo au plus ; PDF et DOCX : 20 Mo (TR-SEC-08). */
export function maxBytesFor(mime: FileMime): number {
  return FILE_TYPES[mime].kind === 'image' ? 10 * MIB : 20 * MIB;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

/**
 * Vrai type d'un fichier d'après ses premiers octets. `null` : type inconnu ou non accepté.
 * Un DOCX est une archive ZIP : la signature `PK` ne suffit pas, la structure interne est contrôlée
 * à la lecture (`docx-text.ts`).
 */
export function sniffFileType(bytes: Uint8Array): FileMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // WebP : « RIFF » + taille + « WEBP »
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
}
