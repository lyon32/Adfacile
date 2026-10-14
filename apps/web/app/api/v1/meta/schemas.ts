// Corps des routes Pages, comptes publicitaires et kit de marque (openapi.yaml), stricts : un champ
// inconnu → 400. Limites du contrat et des contraintes SQL (SECURITY_NOTES §3.1 règle 2).
import { BRAND_TONES } from '@pubeka/core';
import { z } from 'zod';

export const PageUpdateSchema = z
  .strictObject({
    active: z.boolean().optional(),
    ad_language: z.enum(['fr', 'en']).optional(),
    ad_address: z.enum(['vous', 'tu']).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Au moins un champ est attendu',
  });

const HEX = /^#[0-9A-Fa-f]{6}$/;
const PHONE = /^\+[1-9][0-9]{6,14}$/;

export const BrandKitSchema = z.strictObject({
  logo_path: z.string().min(1).max(300).nullable().optional(),
  colors: z
    .strictObject({
      primary: z.string().regex(HEX).optional(),
      secondary: z.string().regex(HEX).optional(),
      accent: z.string().regex(HEX).optional(),
    })
    .optional(),
  font: z.string().max(60).nullable().optional(),
  phone: z.string().regex(PHONE).nullable().optional(),
  whatsapp: z.string().regex(PHONE).nullable().optional(),
  tagline: z.string().max(120).nullable().optional(),
  tone: z.enum(BRAND_TONES).nullable().optional(),
  show_number_on_visuals: z.boolean().optional(),
});
