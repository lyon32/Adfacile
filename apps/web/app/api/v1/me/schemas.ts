// Corps de PATCH /me : schéma `MeUpdate` d'openapi.yaml, strict (champ inconnu → 400).
// Les mêmes limites sont des contraintes SQL de `profiles` (SECURITY_NOTES §3.1 règle 2).
import { z } from 'zod';

export const MeUpdateSchema = z.strictObject({
  first_name: z.string().max(80).optional(),
  last_name: z.string().max(80).optional(),
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/)
    .optional(),
  ui_language: z.enum(['fr', 'en']).optional(),
  country_code: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  city: z.string().max(120).optional(),
  currency_display: z.enum(['XAF', 'XOF']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});
