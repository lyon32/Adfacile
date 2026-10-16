// Formes des colonnes JSON d'une campagne (geo, targeting, copy, tracking) : une seule définition, utilisée par la route
// (corps de requête, strict), par la lecture (données de la base, tolérantes) et par le choix d'une proposition.
// Les LIMITES (125 / 40 / 30 caractères, rayon, âge…) sont vérifiées par `checkCampaignFields`, qui parle en points de
// code et renvoie un message par champ ; ici les bornes ne servent qu'à refuser l'absurde avant d'aller plus loin.
import { z } from 'zod';

// Les listes fermées viennent du Stratège (une seule définition, docs/agents/02 §6).
import { ANGLES, CTAS, DESTINATIONS, OBJECTIVES, OPTIMIZATION_GOALS } from '@pubeka/agents';
export { ANGLES, CTAS, DESTINATIONS, OBJECTIVES, OPTIMIZATION_GOALS };

const PIXEL_ID = /^[0-9]{5,25}$/;
const META_INTEREST_ID = /^[0-9]{3,25}$/;

export const geoSchema = z.strictObject({
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(40)
    .optional(),
  cities: z
    .array(z.strictObject({ name: z.string().min(1).max(200), radius_km: z.number().int() }))
    .max(40)
    .optional(),
});

export const targetingSchema = z.strictObject({
  age_min: z.number().int().min(18).max(65).optional(),
  age_max: z.number().int().min(18).max(65).optional(),
  genders: z.enum(['all', 'male', 'female']).optional(),
  advantage_plus: z.boolean().optional(),
  interests: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(160),
        id: z.string().regex(META_INTEREST_ID).nullable().optional(),
      }),
    )
    .max(40)
    .optional(),
});

export const copySchema = z.strictObject({
  primary_text: z.string().max(1000).optional(),
  headline: z.string().max(400).optional(),
  description: z.string().max(300).nullable().optional(),
  cta: z.enum(CTAS).optional(),
  angle: z.enum(ANGLES).optional(),
});

export const trackingSchema = z.strictObject({ pixel_id: z.string().regex(PIXEL_ID) }).nullable();

export type Geo = z.infer<typeof geoSchema>;
export type Targeting = z.infer<typeof targetingSchema>;
export type AdCopy = z.infer<typeof copySchema>;
export type Tracking = z.infer<typeof trackingSchema>;

/** Lecture tolérante d'une colonne JSON : une valeur illisible vaut « vide » (jamais une exception à l'affichage). */
export function readJson<S extends z.ZodType>(
  schema: S,
  value: unknown,
  empty: z.infer<S>,
): z.infer<S> {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : empty;
}

/** Le type sans `undefined` dans les propriétés facultatives (tsconfig `exactOptionalPropertyTypes`). */
export type Defined<T> = T extends (infer U)[]
  ? Defined<U>[]
  : T extends object
    ? { [K in keyof T]: Defined<Exclude<T[K], undefined>> }
    : T;

/**
 * Retire les propriétés `undefined` (récursivement). Les valeurs viennent d'un schéma Zod déjà validé : la seule conversion
 * de type est celle-ci, parce que TypeScript ne sait pas exprimer « sans les propriétés absentes » à l'exécution.
 */
export function compact<T>(value: T): Defined<T> {
  if (Array.isArray(value)) return value.map((item: unknown) => compact(item)) as Defined<T>;
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = compact(item);
    }
    return out as Defined<T>;
  }
  return value as Defined<T>;
}
