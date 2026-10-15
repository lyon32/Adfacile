// POST /workspaces/{ws}/uploads : annonce un fichier et rend une URL d'envoi signée (API_SPEC §13).
// Le fichier ne passe jamais par l'API : le navigateur l'envoie au stockage privé. Le chemin est construit
// ICI, jamais par le client : `{workspace_id}/{uuid}.{extension du type déclaré}` (SECURITY_NOTES §3.1 règle 7).
//
// Documentation : createSignedUploadUrl (supabase-js, storage-js 2.117.2) rend `signedUrl`, `token` et `path`,
// valable 2 HEURES, durée non réglable. L'API promet 5 minutes : la fenêtre de 5 minutes est donc imposée par
// le serveur (`expires_at` du registre `uploads`), qui refuse ensuite un fichier arrivé trop tard.
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import {
  FILE_TYPES,
  PURPOSE_RULES,
  isFileMime,
  maxBytesFor,
  type UploadPurpose,
} from './file-types';

export const UPLOAD_WINDOW_MS = 5 * 60 * 1000;

export interface UploadRequestInput {
  purpose: UploadPurpose;
  mime: string;
  size: number;
}

export interface UploadTicket {
  upload_url: string;
  file_path: string;
  expires_at: string;
}

export async function createUploadTicket(
  ctx: MemberCtx,
  input: UploadRequestInput,
  newId: () => string = () => crypto.randomUUID(),
): Promise<UploadTicket> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);

  const rule = PURPOSE_RULES[input.purpose];
  if (!isFileMime(input.mime) || !rule.mimes.includes(input.mime)) {
    throw new AppError('unsupported_file_type');
  }
  const limit = Math.min(maxBytesFor(input.mime), rule.maxBytes);
  if (input.size > limit) throw new AppError('file_too_large', { meta: { max_bytes: limit } });

  const filePath = `${ctx.workspace.id}/${newId()}.${FILE_TYPES[input.mime].ext}`;
  const expiresAt = new Date(ctx.now().getTime() + UPLOAD_WINDOW_MS);

  // Enregistrer d'abord : un fichier absent du registre n'est jamais lu (SECURITY_NOTES §3.3).
  const inserted = await ctx.svc.from('uploads').insert({
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    purpose: input.purpose,
    bucket: rule.bucket,
    file_path: filePath,
    declared_mime: input.mime,
    declared_size: input.size,
    expires_at: expiresAt.toISOString(),
  });
  if (inserted.error !== null) throw new AppError('internal_error', { cause: inserted.error });

  const signed = await ctx.svc.storage.from(rule.bucket).createSignedUploadUrl(filePath);
  if (signed.error !== null) {
    await ctx.svc.from('uploads').delete().eq('workspace_id', ctx.workspace.id).eq('file_path', filePath);
    throw new AppError('provider_unavailable', { cause: signed.error });
  }
  return {
    upload_url: signed.data.signedUrl,
    file_path: filePath,
    expires_at: expiresAt.toISOString(),
  };
}
