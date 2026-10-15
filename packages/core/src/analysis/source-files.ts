// Vérification d'un fichier envoyé (SECURITY_NOTES §3.3, API_SPEC §13, TR-SEC-08), faite quand le fichier est UTILISÉ
// (début d'une analyse), jamais sur la parole du client :
//  1. le chemin doit exister dans le registre `uploads` POUR CET ESPACE (sinon 404 : un fichier posé directement dans le
//     stockage, ou celui d'un autre espace, n'est jamais lu) ;
//  2. la fenêtre de 5 minutes de l'URL d'envoi est respectée (l'URL signée de Supabase dure 2 h, non réglable) ;
//  3. la taille réelle est contrôlée AVANT le téléchargement, puis le vrai type est lu sur les premiers octets ;
//  4. le type réel doit être celui annoncé et accepté pour l'usage (un PNG renommé en PDF est refusé) ;
//  5. une image est RÉ-ENCODÉE (métadonnées et contenu caché supprimés) et remplace l'original dans le stockage.
// Un fichier refusé est supprimé du stockage et marqué `rejected` : il ne sera plus jamais lu.
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../context';
import type { ImageMime, ImageProcessor } from './deps';
import {
  FILE_TYPES,
  PURPOSE_RULES,
  isFileMime,
  maxBytesFor,
  sniffFileType,
  type FileKind,
  type FileMime,
  type UploadBucket,
  type UploadPurpose,
} from '../uploads/file-types';

export interface VerifiedFile {
  uploadId: string;
  bucket: UploadBucket;
  filePath: string;
  mime: FileMime;
  kind: FileKind;
  size: number;
}

interface UploadRow {
  id: string;
  purpose: string;
  bucket: string;
  file_path: string;
  declared_mime: string;
  declared_size: number;
  status: string;
  verified_mime: string | null;
  verified_size: number | null;
  expires_at: string;
}

const COLUMNS =
  'id, purpose, bucket, file_path, declared_mime, declared_size, status, verified_mime, verified_size, expires_at';
const KNOWN_BUCKETS: readonly string[] = ['sources', 'brand', 'support'];
/** Un fichier de plus de 20 Mo n'existe dans aucun usage : refus avant tout téléchargement. */
const HARD_MAX_BYTES = 20 * 1024 * 1024;
const SMALL_SLACK_MS = 2000;

function isBucket(value: string): value is UploadBucket {
  return KNOWN_BUCKETS.includes(value);
}

async function reject(ctx: MemberCtx, row: UploadRow, error: AppError): Promise<never> {
  // Le fichier refusé est retiré du stockage (au mieux) et ne servira plus.
  if (isBucket(row.bucket)) await ctx.svc.storage.from(row.bucket).remove([row.file_path]);
  await ctx.svc
    .from('uploads')
    .update({ status: 'rejected' })
    .eq('workspace_id', ctx.workspace.id)
    .eq('id', row.id);
  throw error;
}

export interface VerifyOptions {
  /** Usage attendu du fichier : `source` pour les sources d'une analyse. */
  purposes: readonly UploadPurpose[];
  kind: FileKind;
  images: ImageProcessor;
}

export async function verifyUploadedFile(
  ctx: MemberCtx,
  filePath: string,
  options: VerifyOptions,
): Promise<VerifiedFile> {
  const workspaceId = ctx.workspace.id;
  // Le chemin doit commencer par l'espace de la requête ET exister en base pour cet espace (SECURITY_NOTES §3.3).
  if (!filePath.startsWith(`${workspaceId}/`)) throw new AppError('not_found');
  const found = await ctx.svc
    .from('uploads')
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('file_path', filePath)
    .maybeSingle();
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  const row: UploadRow | null = found.data;
  if (row === null || row.status === 'rejected') throw new AppError('not_found');
  if (!isBucket(row.bucket) || !(options.purposes as readonly string[]).includes(row.purpose)) {
    throw new AppError('not_found');
  }
  const bucket = row.bucket;

  // Déjà vérifié : on ne refait ni le téléchargement ni le ré-encodage.
  if (row.status === 'verified' && row.verified_mime !== null && isFileMime(row.verified_mime)) {
    const verifiedMime = row.verified_mime;
    if (FILE_TYPES[verifiedMime].kind !== options.kind) throw new AppError('unsupported_file_type');
    return {
      uploadId: row.id,
      bucket,
      filePath,
      mime: verifiedMime,
      kind: options.kind,
      size: row.verified_size ?? row.declared_size,
    };
  }

  const store = ctx.svc.storage.from(bucket);
  const info = await store.info(filePath);
  if (info.error !== null) throw new AppError('not_found'); // jamais envoyé

  // Fenêtre de 5 minutes : un fichier arrivé après l'expiration du ticket n'est pas accepté.
  const uploadedAt = Date.parse(info.data.createdAt);
  if (!Number.isNaN(uploadedAt) && uploadedAt > Date.parse(row.expires_at) + SMALL_SLACK_MS) {
    return reject(ctx, row, new AppError('gone'));
  }

  const size = info.data.size;
  if (size === undefined || size < 1) {
    return reject(ctx, row, new AppError('unsupported_file_type', { meta: { reason: 'empty' } }));
  }
  if (size > HARD_MAX_BYTES) return reject(ctx, row, new AppError('file_too_large'));

  const downloaded = await store.download(filePath);
  if (downloaded.error !== null)
    throw new AppError('provider_unavailable', { cause: downloaded.error });
  let bytes: Uint8Array = new Uint8Array(await downloaded.data.arrayBuffer());

  // Vrai type par les premiers octets, jamais par l'extension ni par le type annoncé.
  const real = sniffFileType(bytes);
  const rule = PURPOSE_RULES[row.purpose as UploadPurpose];
  if (real === null || !rule.mimes.includes(real) || real !== row.declared_mime) {
    return reject(
      ctx,
      row,
      new AppError('unsupported_file_type', { meta: { reason: 'content_mismatch' } }),
    );
  }
  if (FILE_TYPES[real].kind !== options.kind) {
    return reject(
      ctx,
      row,
      new AppError('unsupported_file_type', { meta: { reason: 'wrong_kind' } }),
    );
  }
  if (bytes.length > Math.min(maxBytesFor(real), rule.maxBytes)) {
    return reject(ctx, row, new AppError('file_too_large'));
  }

  let mime: FileMime = real;
  if (options.kind === 'image') {
    try {
      const clean = await options.images.reencode(bytes, real as ImageMime);
      bytes = clean.bytes;
      mime = clean.mime;
    } catch (error) {
      const refused =
        error instanceof AppError ? error : new AppError('unsupported_file_type', { cause: error });
      return reject(ctx, row, refused);
    }
    const written = await store.upload(filePath, Uint8Array.from(bytes), {
      contentType: mime,
      upsert: true,
    });
    if (written.error !== null)
      throw new AppError('provider_unavailable', { cause: written.error });
  }

  const verified = await ctx.svc
    .from('uploads')
    .update({
      status: 'verified',
      verified_mime: mime,
      verified_size: bytes.length,
      verified_at: ctx.now().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', row.id);
  if (verified.error !== null) throw new AppError('internal_error', { cause: verified.error });
  return { uploadId: row.id, bucket, filePath, mime, kind: options.kind, size: bytes.length };
}
