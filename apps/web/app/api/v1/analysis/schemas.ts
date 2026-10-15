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

const sourceUrl = z.url({ protocol: /^https?$/ }).max(2048);

/**
 * Une source selon son type (openapi.yaml « AnalysisRequest »). Les champs d'un autre type sont refusés (400) : un
 * `website` sans `url`, ou une `image` avec une `url`, est une erreur du client.
 */
const sourceSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('website'), url: sourceUrl }),
  z.strictObject({ type: z.literal('app_link'), url: sourceUrl }),
  z.strictObject({ type: z.literal('social_post'), url: sourceUrl }),
  z.strictObject({ type: z.literal('image'), file_path: z.string().min(1).max(300) }),
  z.strictObject({ type: z.literal('document'), file_path: z.string().min(1).max(300) }),
  z.strictObject({ type: z.literal('text'), text: z.string().min(1).max(5000) }),
]);

export const analysisRequestSchema = z.strictObject({
  page_id: z.uuid().optional(),
  user_intent: z.string().max(1000).optional(),
  sources: z.array(sourceSchema).min(1).max(12),
});

export const answersRequestSchema = z.strictObject({
  answers: z
    .array(z.strictObject({ question_id: z.string().min(1).max(20), answer: z.string().max(500) }))
    .min(1)
    .max(5),
});
