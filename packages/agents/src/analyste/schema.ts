// Entrée et sortie de l'Analyste (docs/agents/01-analyste-business.md §4 et §6). La sortie est une donnée NON FIABLE
// (SECURITY_NOTES §3.5) : validée ici, puis contrôlée par `grounding.ts` (R3 : aucune valeur sans source).
// Tolérance volontaire : un champ nullable absent vaut `null`, un tableau absent vaut `[]`, car chaque rejet de schéma
// coûte un nouvel appel (TR-AGT-01). Ce qui ne se rattrape pas (secteur hors liste, nombre de questions) est refusé.
import { z } from 'zod';

export const SECTORS = [
  'fashion_clothing',
  'fashion_shoes',
  'beauty_cosmetics',
  'hair',
  'food_restaurant',
  'food_delivery',
  'grocery',
  'electronics',
  'phones_accessories',
  'real_estate',
  'auto',
  'education_training',
  'health_wellness',
  'fitness',
  'events',
  'travel_tourism',
  'services_b2b',
  'services_home',
  'finance_insurance',
  'app_software',
  'ecommerce_general',
  'crafts_art',
  'agriculture',
  'other',
] as const;

export const QUESTION_INPUTS = [
  'phone',
  'text',
  'single_choice',
  'multi_choice',
  'location',
  'number',
] as const;

const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => z.string().max(max).nullable().default(null);
const sourceIndex = z.number().int().min(0).max(50).nullable().default(null);
const confidence = z.number().min(0).max(1);

const price = z
  .object({ amount: z.number().min(0).max(1e12), currency: z.string().min(1).max(8) })
  .nullable()
  .default(null);

const profile = z.object({
  business_name: z
    .object({ value: nullableText(200), source: sourceIndex })
    .default({ value: null, source: null }),
  sector: z.object({ value: z.enum(SECTORS), confidence }),
  offer_type: z.enum(['product', 'service', 'app', 'event', 'content']),
  products: z
    .array(
      z.object({
        name: text(300),
        price,
        description: text(1000).default(''),
        source: sourceIndex,
      }),
    )
    .max(60)
    .default([]),
  // « max 5 » (docs/agents/01 §6) : on garde les cinq premiers plutôt que de rejeter.
  value_props: z
    .array(text(300))
    .max(30)
    .default([])
    .transform((list) => list.slice(0, 5)),
  target_audience: z
    .object({
      description: nullableText(500),
      age_range: z
        .tuple([z.number().int().min(0).max(120), z.number().int().min(0).max(120)])
        .nullable()
        .default(null),
      gender: z.enum(['all', 'male', 'female']).nullable().default(null),
    })
    .default({ description: null, age_range: null, gender: null }),
  locations: z
    .array(
      z.object({
        country: text(100),
        city: nullableText(100),
        area: nullableText(100),
        delivery: z.boolean().nullable().default(null),
      }),
    )
    .max(30)
    .default([]),
  contacts: z
    .object({
      whatsapp: nullableText(40),
      phone: nullableText(40),
      website: nullableText(300),
      instagram: nullableText(100),
    })
    .default({ whatsapp: null, phone: null, website: null, instagram: null }),
  tone: z
    .object({ value: nullableText(60), confidence: confidence.default(0) })
    .default({ value: null, confidence: 0 }),
  promotions: z
    .array(z.object({ text: text(500), valid_until: nullableText(40), source: sourceIndex }))
    .max(30)
    .default([]),
  has_ecommerce_checkout: z.boolean().nullable().default(null),
  languages_detected: z.array(text(10)).max(10).default([]),
});

const question = z.object({
  id: z.string().min(1).max(20),
  field: text(100).default(''),
  text: z.string().min(3).max(300),
  input: z.enum(QUESTION_INPUTS),
  options: z.array(text(120)).max(20).nullable().default(null),
  required: z.boolean().default(true),
  why: text(300).default(''),
});

export const analysteOutputSchema = z
  .object({
    profile,
    conflicts: z
      .array(
        z.object({
          field: text(100),
          values: z.array(z.string().max(300)).max(10),
          kept: text(300).default(''),
          reason: text(500).default(''),
        }),
      )
      .max(30)
      .default([]),
    sensitive_signals: z.array(text(40)).max(20).default([]),
    missing: z.array(text(100)).max(60).default([]),
    questions: z.array(question).max(5).default([]),
    flags: z.array(text(60)).max(20).default([]),
  })
  .superRefine((out, ctx) => {
    // 3 à 5 questions, sauf produit illégal (aucune campagne ne sera créée : le refus remplace les questions).
    const illegal = out.flags.includes('ILLEGAL_PRODUCT');
    if (!illegal && out.questions.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'il faut entre 3 et 5 questions',
      });
    }
    const ids = new Set(out.questions.map((q) => q.id));
    if (ids.size !== out.questions.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'identifiants de questions en double',
      });
    }
  });

export type AnalysteOutput = z.infer<typeof analysteOutputSchema>;
export type AnalysteQuestion = AnalysteOutput['questions'][number];

export const BRAND_KIT_TONES = ['premium', 'friendly', 'bold', 'serious', 'playful'] as const;

const sourceEntry = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('website'),
    url: z.string().max(2048),
    extracted_text: z.string().max(200_000),
  }),
  z.object({
    type: z.literal('app_link'),
    url: z.string().max(2048),
    extracted_text: z.string().max(200_000),
  }),
  z.object({
    type: z.literal('social_post'),
    url: z.string().max(2048),
    extracted_text: z.string().max(200_000),
  }),
  z.object({
    type: z.literal('document'),
    filename: z.string().max(200),
    extracted_text: z.string().max(200_000),
  }),
  z.object({
    type: z.literal('image'),
    role: z.enum(['product', 'post', 'reference']).default('product'),
  }),
  z.object({ type: z.literal('text'), content: z.string().max(5000) }),
]);
export type AnalysteSource = z.infer<typeof sourceEntry>;

/** Image envoyée au modèle : `index` est la position de la source dans `sources` (pour que `source` pointe juste). */
export const analysteImageSchema = z.object({
  index: z.number().int().min(0).max(50),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  /** Octets de l'image déjà ré-encodée par le serveur, en base64. */
  base64: z.string().min(1),
});
export type AnalysteImage = z.infer<typeof analysteImageSchema>;

export const analysteInputSchema = z.object({
  business_id: z.string().min(1).max(64),
  locale: z.object({
    country: z.string().min(2).max(2),
    currency_display: z.string().max(8).optional(),
    output_language: z.enum(['fr', 'en']),
  }),
  brand_kit: z
    .object({
      phone: z.string().nullable().optional(),
      whatsapp: z.string().nullable().optional(),
      tagline: z.string().nullable().optional(),
      tone: z.enum(BRAND_KIT_TONES).nullable().optional(),
    })
    .nullable()
    .default(null),
  sources: z.array(sourceEntry).min(1).max(12),
  images: z.array(analysteImageSchema).max(10).default([]),
  user_intent: z.string().max(1000).nullable().default(null),
});
export type AnalysteInput = z.input<typeof analysteInputSchema>;
export type ParsedAnalysteInput = z.output<typeof analysteInputSchema>;
