// Entrée et sortie du Stratège (docs/agents/02-stratege-campagne.md §4 et §6). La sortie est une donnée NON FIABLE
// (SECURITY_NOTES §3.5) : elle est validée ici, et les règles que le prompt ne peut qu'espérer (R3 : aucune valeur sans
// source, ton vous/tu, mots interdits, limites de caractères, budget minimum) sont vérifiées par le CODE dans le schéma
// de sortie : `runAgent` en tire son unique nouvel essai (TR-AGT-01), puis l'échec est visible. Jamais un 3ᵉ appel.
import { z } from 'zod';
import { checkCopy, checkReasons, type CopyContext } from './copy-rules';

export const OBJECTIVES = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
  'OUTCOME_SALES',
] as const;
export const DESTINATIONS = [
  'WHATSAPP',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
  'WEBSITE',
  'APP',
  'ON_POST',
  'NONE',
] as const;
export const OPTIMIZATION_GOALS = [
  'CONVERSATIONS',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'POST_ENGAGEMENT',
  'REACH',
  'OFFSITE_CONVERSIONS',
] as const;
export const CTAS = [
  'SEND_WHATSAPP_MESSAGE',
  'SEND_MESSAGE',
  'LEARN_MORE',
  'SHOP_NOW',
  'ORDER_NOW',
  'CONTACT_US',
  'BOOK_NOW',
  'SIGN_UP',
  'GET_OFFER',
] as const;
export const ANGLES = [
  'price',
  'quality',
  'speed',
  'scarcity',
  'social_proof',
  'novelty',
  'convenience',
] as const;

/** Destinations permises par objectif (PRD §7.1, docs/agents/02 §7.1). `core` en tient une copie, comparée par un test. */
export const OBJECTIVE_DESTINATIONS: Readonly<
  Record<(typeof OBJECTIVES)[number], readonly string[]>
> = {
  OUTCOME_ENGAGEMENT: ['WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'ON_POST'],
  OUTCOME_TRAFFIC: ['WEBSITE', 'APP'],
  OUTCOME_AWARENESS: ['NONE'],
  OUTCOME_SALES: ['WEBSITE'],
};

export const MIN_DAILY_USD_CENTS = 100;
export const MAX_DAILY_USD_CENTS = 1_000_000;
/** Durée maximale, début et fin compris. */
const MAX_DAYS = 365;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().max(max);

// ---- Entrée ---------------------------------------------------------------------------------------------------------

const previousProposal = z.object({
  objective: z.enum(OBJECTIVES),
  destination: z.enum(DESTINATIONS),
  angle: z.enum(ANGLES),
  primary_text: text(300),
  headline: text(100),
  city_names: z.array(text(100)).max(20).default([]),
});
export type PreviousProposal = z.infer<typeof previousProposal>;

export const strategeInputSchema = z.object({
  /** Date du jour dans le fuseau de l'utilisateur (AAAA-MM-JJ) : « demain » en dépend. */
  today: isoDate,
  output_language: z.enum(['fr', 'en']),
  ad_address: z.enum(['vous', 'tu']).default('vous'),
  /** `BusinessProfile` de l'Analyste (docs/agents/01 §6), tel qu'enregistré. */
  profile: z.record(z.string(), z.unknown()),
  answers: z
    .array(z.object({ question: text(300), answer: text(500) }))
    .max(10)
    .default([]),
  brand_kit: z
    .object({
      phone: z.string().nullable().optional(),
      whatsapp: z.string().nullable().optional(),
      tagline: z.string().nullable().optional(),
    })
    .nullable()
    .default(null),
  account_state: z.object({
    has_whatsapp_linked: z.boolean(),
    has_instagram_linked: z.boolean().default(false),
    pixels: z
      .array(
        z.object({ id: z.string().regex(/^[0-9]{5,25}$/), name: text(200), active: z.boolean() }),
      )
      .max(50)
      .default([]),
  }),
  user_constraints: z
    .object({
      budget_daily_usd_cents: z
        .number()
        .int()
        .min(MIN_DAILY_USD_CENTS)
        .max(MAX_DAILY_USD_CENTS)
        .nullable()
        .default(null),
      start_date: isoDate.nullable().default(null),
      end_date: isoDate.nullable().default(null),
      objective: z.enum(OBJECTIVES).nullable().default(null),
    })
    .default({ budget_daily_usd_cents: null, start_date: null, end_date: null, objective: null }),
  previous_proposals: z.array(previousProposal).max(5).default([]),
});
export type StrategeInput = z.input<typeof strategeInputSchema>;
export type ParsedStrategeInput = z.output<typeof strategeInputSchema>;

// ---- Sortie ---------------------------------------------------------------------------------------------------------

const baseOutput = z.object({
  objective: z.enum(OBJECTIVES),
  objective_reason: text(500).default(''),
  destination: z.enum(DESTINATIONS),
  optimization_goal: z.enum(OPTIMIZATION_GOALS),
  geo: z.object({
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(20)
      .default([]),
    cities: z
      .array(
        z.object({ name: z.string().min(1).max(100), radius_km: z.number().int().min(1).max(80) }),
      )
      .max(20)
      .default([]),
    reason: text(500).default(''),
  }),
  advanced_targeting: z
    .object({
      age_min: z.number().int().min(18).max(65).default(18),
      age_max: z.number().int().min(18).max(65).default(65),
      genders: z.enum(['all', 'male', 'female']).default('all'),
      advantage_plus: z.boolean().default(true),
    })
    .default({ age_min: 18, age_max: 65, genders: 'all', advantage_plus: true }),
  budget: z.object({
    daily_usd_cents: z.number().int().min(MIN_DAILY_USD_CENTS).max(MAX_DAILY_USD_CENTS),
    reason: text(500).default(''),
  }),
  schedule: z.object({ start_date: isoDate, end_date: isoDate, reason: text(500).default('') }),
  copy: z.object({
    primary_text: z.string().min(1),
    headline: z.string().min(1),
    description: z.string().nullable().default(null),
    cta: z.enum(CTAS),
    angle: z.enum(ANGLES),
  }),
  tracking: z
    .object({ pixel_id: z.string().regex(/^[0-9]{5,25}$/) })
    .nullable()
    .default(null),
  warnings: z.array(text(300)).max(10).default([]),
  visual_brief: text(1000).default(''),
  flags: z.array(text(60)).max(20).default([]),
});

export type StrategeOutput = z.output<typeof baseOutput>;

/** Forme d'une proposition enregistrée (sans les règles qui dépendent de l'entrée) : relue à l'affichage et au choix. */
export const strategeStoredSchema = baseOutput;

/** Gabarit « fiche trop pauvre » (docs/agents/02 §10) : l'agent peut ne rendre aucune proposition. */
export const INSUFFICIENT_PROFILE = 'INSUFFICIENT_PROFILE';

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function validDate(value: string): boolean {
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

/**
 * Schéma de sortie PROPRE à une entrée : il connaît le texte des sources (R3), le ton demandé, la date du jour, les
 * pixels du compte, le WhatsApp lié et les contraintes de l'utilisateur. Une violation donne un message précis, renvoyé au
 * modèle pour son unique nouvel essai.
 */
export function strategeOutputSchemaFor(input: ParsedStrategeInput, context: CopyContext) {
  return baseOutput.superRefine((out, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: 'custom', path, message });
    };

    if (!OBJECTIVE_DESTINATIONS[out.objective].includes(out.destination)) {
      issue(
        ['destination'],
        `la destination ${out.destination} ne convient pas à l'objectif ${out.objective}`,
      );
    }
    if (out.destination === 'WHATSAPP' && !input.account_state.has_whatsapp_linked) {
      issue(
        ['destination'],
        "WhatsApp n'est pas lié : utilise MESSENGER et ajoute un avertissement",
      );
    }
    if (out.destination === 'INSTAGRAM_DIRECT' && !input.account_state.has_instagram_linked) {
      issue(['destination'], "Instagram n'est pas lié : n'utilise pas INSTAGRAM_DIRECT");
    }
    const wanted = input.user_constraints.objective;
    if (wanted !== null && out.objective !== wanted) {
      issue(['objective'], `l'utilisateur impose l'objectif ${wanted}`);
    }
    const budget = input.user_constraints.budget_daily_usd_cents;
    if (budget !== null && out.budget.daily_usd_cents !== budget) {
      issue(
        ['budget', 'daily_usd_cents'],
        `l'utilisateur impose ${String(budget)} centimes par jour`,
      );
    }

    // Dates : début après aujourd'hui (« demain » par défaut), fin après le début, 365 jours au plus.
    const { start_date: start, end_date: end } = out.schedule;
    if (!validDate(start) || !validDate(end)) {
      issue(['schedule'], 'dates inexistantes ou mal formées (AAAA-MM-JJ)');
    } else {
      if (start < input.today)
        issue(['schedule', 'start_date'], `la date de début ne peut pas être avant ${input.today}`);
      if (end <= start)
        issue(['schedule', 'end_date'], 'la date de fin doit suivre la date de début');
      else if (daysBetween(start, end) + 1 > MAX_DAYS)
        issue(
          ['schedule', 'end_date'],
          'une campagne dure 365 jours au plus, début et fin compris',
        );
    }

    const { start_date: wantedStart, end_date: wantedEnd } = input.user_constraints;
    if (wantedStart !== null && start !== wantedStart)
      issue(['schedule', 'start_date'], `l'utilisateur impose le début le ${wantedStart}`);
    if (wantedEnd !== null && end !== wantedEnd)
      issue(['schedule', 'end_date'], `l'utilisateur impose la fin le ${wantedEnd}`);

    if (out.tracking !== null) {
      const known = input.account_state.pixels.some((p) => p.id === out.tracking?.pixel_id);
      if (!known)
        issue(
          ['tracking', 'pixel_id'],
          "ce pixel n'existe pas sur le compte : mets tracking à null",
        );
    }
    if (out.advanced_targeting.age_min > out.advanced_targeting.age_max) {
      issue(['advanced_targeting', 'age_min'], "l'âge minimum dépasse l'âge maximum");
    }
    if (out.geo.countries.length === 0 && out.geo.cities.length === 0) {
      issue(['geo'], 'indique au moins un pays ou une ville');
    }

    for (const violation of checkCopy(out, context)) issue(violation.path, violation.message);
    // Les justifications et avertissements sont affichés à l'écran : même contrôle R3 (nombres déduits de la proposition permis).
    for (const violation of checkReasons(out, context)) issue(violation.path, violation.message);
  });
}
