// Schémas Zod stricts des routes « campagnes » (SECURITY_NOTES §3.1 : champ inconnu → 400). Les formes viennent de `core`
// (une seule définition) ; les règles chiffrées (budget, dates, longueurs en points de code) sont dans `checkCampaignFields`.
import {
  copySchema,
  DESTINATIONS,
  geoSchema,
  OBJECTIVES,
  targetingSchema,
  trackingSchema,
} from '@pubeka/core';
import { z } from 'zod';

export const createCampaignSchema = z.strictObject({
  analysis_id: z.uuid(),
  page_id: z.uuid().optional(),
  platform: z.literal('meta'),
});

export const updateCampaignSchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  objective: z.enum(OBJECTIVES).optional(),
  destination: z.enum(DESTINATIONS).optional(),
  geo: geoSchema.optional(),
  targeting: targetingSchema.optional(),
  // Aucun minimum ici : un budget sous 1 $ est un `422 budget_too_low`, pas un 400 (SECURITY_NOTES §3.2).
  daily_budget_usd_cents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  start_date: z.string().max(10).optional(),
  end_date: z.string().max(10).optional(),
  copy: copySchema.optional(),
  tracking: trackingSchema.optional(),
  ab_test: z.boolean().optional(),
  version: z.number().int().min(1),
});

/** Retenir une proposition : la version du brouillon lue par le client (verrou optimiste, EC-TEAM-08). */
export const chooseProposalSchema = z.strictObject({
  version: z.number().int().min(1),
});
