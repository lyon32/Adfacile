// Schémas Zod stricts des routes « sources et analyse » (SECURITY_NOTES §3.1 : champ inconnu → 400).
import { UPLOAD_PURPOSES } from '@pubeka/core';
import { z } from 'zod';

/**
 * `mime` et `size` ne sont pas bornés ici : un type refusé donne 415 et une taille excessive 413, décidés par
 * `createUploadTicket` (liste d'autorisation et limites par type), pas un 400 générique.
 */
export const uploadRequestSchema = z.strictObject({
  purpose: z.enum(UPLOAD_PURPOSES),
  mime: z.string().min(1).max(120),
  size: z.number().int().min(1),
});
