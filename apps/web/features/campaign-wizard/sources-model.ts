// Règles pures de l'étape « Sources » (APPFLOW §8.1) : types de sources, contrôle des fichiers avant envoi, charge utile.
// Le contrôle fait ici n'est qu'un confort (message immédiat) : le serveur vérifie le vrai type par les premiers octets.
import type { SourcePayload, StartAnalysisBody } from './api';

export const SOURCE_KINDS = ['website', 'photo', 'post', 'document', 'text'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const MAX_PHOTOS = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_CHARS = 5000;
export const MAX_INTENT_CHARS = 1000;

export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
export const DOCUMENT_TYPES: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export type FileProblem = 'file_type' | 'file_too_large_image' | 'file_too_large_document';

export function checkFile(
  file: { type: string; size: number },
  kind: 'image' | 'document',
): FileProblem | null {
  const allowed = kind === 'image' ? IMAGE_TYPES : DOCUMENT_TYPES;
  if (!allowed.includes(file.type) || file.size < 1) return 'file_type';
  const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (file.size > limit)
    return kind === 'image' ? 'file_too_large_image' : 'file_too_large_document';
  return null;
}

/** Adresse http(s) valide : seule vérification de forme ; l'adresse est jugée « publique » par le serveur. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

const APP_STORES = ['play.google.com', 'apps.apple.com'];

/** Une adresse de boutique d'applications est une source `app_link`, le reste un `website`. */
export function websiteType(url: string): 'website' | 'app_link' {
  try {
    return APP_STORES.includes(new URL(url).hostname) ? 'app_link' : 'website';
  } catch {
    return 'website';
  }
}

export interface Draft {
  kinds: SourceKind[];
  websiteUrl: string;
  postUrl: string;
  text: string;
  intent: string;
  pageId: string;
  photos: File[];
  document: File | null;
}

export const EMPTY_DRAFT: Draft = {
  kinds: [],
  websiteUrl: '',
  postUrl: '',
  text: '',
  intent: '',
  pageId: '',
  photos: [],
  document: null,
};

export type DraftError =
  | { field: 'websiteUrl' | 'postUrl'; code: 'url_invalid' }
  | { field: 'text'; code: 'text_too_long' }
  | { field: 'photos'; code: FileProblem | 'too_many_photos' }
  | { field: 'document'; code: FileProblem }
  | { field: 'sources'; code: 'need_one' };

/** Erreurs de saisie bloquantes. Une source choisie mais vide est ignorée (elle ne compte pas). */
export function validateDraft(draft: Draft): DraftError[] {
  const errors: DraftError[] = [];
  const has = (kind: SourceKind): boolean => draft.kinds.includes(kind);
  if (has('website') && draft.websiteUrl.trim() !== '' && !isHttpUrl(draft.websiteUrl)) {
    errors.push({ field: 'websiteUrl', code: 'url_invalid' });
  }
  if (has('post') && draft.postUrl.trim() !== '' && !isHttpUrl(draft.postUrl)) {
    errors.push({ field: 'postUrl', code: 'url_invalid' });
  }
  if (has('text') && draft.text.length > MAX_TEXT_CHARS) {
    errors.push({ field: 'text', code: 'text_too_long' });
  }
  if (has('photo')) {
    if (draft.photos.length > MAX_PHOTOS) errors.push({ field: 'photos', code: 'too_many_photos' });
    for (const file of draft.photos) {
      const problem = checkFile(file, 'image');
      if (problem !== null) {
        errors.push({ field: 'photos', code: problem });
        break;
      }
    }
  }
  if (has('document') && draft.document !== null) {
    const problem = checkFile(draft.document, 'document');
    if (problem !== null) errors.push({ field: 'document', code: problem });
  }
  if (errors.length === 0 && countSources(draft) === 0)
    errors.push({ field: 'sources', code: 'need_one' });
  return errors;
}

/** Nombre de sources réellement fournies (choisies ET remplies). */
export function countSources(draft: Draft): number {
  const has = (kind: SourceKind): boolean => draft.kinds.includes(kind);
  return (
    (has('website') && draft.websiteUrl.trim() !== '' ? 1 : 0) +
    (has('post') && draft.postUrl.trim() !== '' ? 1 : 0) +
    (has('text') && draft.text.trim() !== '' ? 1 : 0) +
    (has('photo') ? draft.photos.length : 0) +
    (has('document') && draft.document !== null ? 1 : 0)
  );
}

/** Fichiers à envoyer avant l'analyse, dans l'ordre des sources. */
export function filesToUpload(draft: Draft): { file: File; type: 'image' | 'document' }[] {
  const out: { file: File; type: 'image' | 'document' }[] = [];
  if (draft.kinds.includes('photo'))
    for (const file of draft.photos) out.push({ file, type: 'image' });
  if (draft.kinds.includes('document') && draft.document !== null)
    out.push({ file: draft.document, type: 'document' });
  return out;
}

/** Corps de POST /analyses ; `paths` suit `filesToUpload` (chemins rendus par le serveur). */
export function buildBody(draft: Draft, paths: readonly string[]): StartAnalysisBody {
  const sources: SourcePayload[] = [];
  const has = (kind: SourceKind): boolean => draft.kinds.includes(kind);
  if (has('website') && draft.websiteUrl.trim() !== '') {
    const url = draft.websiteUrl.trim();
    sources.push({ type: websiteType(url), url });
  }
  if (has('post') && draft.postUrl.trim() !== '')
    sources.push({ type: 'social_post', url: draft.postUrl.trim() });
  filesToUpload(draft).forEach((entry, index) => {
    const file_path = paths[index];
    if (file_path !== undefined) sources.push({ type: entry.type, file_path });
  });
  if (has('text') && draft.text.trim() !== '')
    sources.push({ type: 'text', text: draft.text.trim() });
  return {
    ...(draft.pageId === '' ? {} : { page_id: draft.pageId }),
    ...(draft.intent.trim() === '' ? {} : { user_intent: draft.intent.trim() }),
    sources,
  };
}
