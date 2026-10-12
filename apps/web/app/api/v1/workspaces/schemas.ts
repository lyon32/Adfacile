// Corps des routes « Espaces et équipe » (openapi.yaml), stricts : un champ inconnu → 400.
// Les limites sont celles du contrat et des contraintes SQL (SECURITY_NOTES §3.1 règle 2).
import { isUuid } from '@pubeka/shared';
import { z } from 'zod';
import { fieldError } from '../../../../server/http/problem';

export const RenameWorkspaceSchema = z.strictObject({
  name: z.string().min(1).max(120),
});

export const ChangeMemberRoleSchema = z.strictObject({
  role: z.enum(['editor', 'viewer']),
});

export const InviteMemberSchema = z.strictObject({
  email: z.email().max(254),
  role: z.enum(['editor', 'viewer']),
});

export const TransferOwnershipSchema = z.strictObject({
  profile_id: z.uuid(),
});

/** Paramètre d'adresse `{profileId}` : UUID, sinon 400 (jamais envoyé tel quel à la base). */
export function profileIdParam(params: Record<string, string>): string {
  const value = params.profileId ?? '';
  if (!isUuid(value)) throw fieldError('profileId', 'invalid_format', 'UUID attendu');
  return value;
}
