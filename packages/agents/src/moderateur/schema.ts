// Entrée et sortie du Modérateur (docs/agents/04-moderateur.md §5 et §6). Le Modérateur n'est appelé QU'APRÈS un refus de Meta.
// Sa sortie est une donnée NON FIABLE (SECURITY_NOTES §3.5) : elle est validée ici, et les règles que le prompt ne peut
// qu'espérer sont vérifiées par le CODE dans le schéma de sortie. `runAgent` en tire son unique nouvel essai (TR-AGT-01), puis
// l'échec est visible. Jamais un 3ᵉ appel.
import { z } from 'zod';
import { codePoints, numbersIn } from '../stratege/copy-rules';

export const REJECTION_CATEGORIES = [
  'personal_attributes',
  'misleading_claims',
  'before_after',
  'prohibited_product',
  'restricted_product',
  'sensational_content',
  'adult_content',
  'landing_page',
  'intellectual_property',
  'text_quality',
  'other',
] as const;
export type RejectionCategory = (typeof REJECTION_CATEGORIES)[number];

export const CULPRIT_PLACES = [
  'primary_text',
  'headline',
  'description',
  'visual',
  'landing_page',
  'product',
  'unknown',
] as const;
export type CulpritPlace = (typeof CULPRIT_PLACES)[number];

/** Champs de texte de la publicité qu'une correction peut remplacer d'un clic (limites de caractères de Meta). */
export const FIXABLE_COPY_FIELDS = ['primary_text', 'headline', 'description'] as const;
export type FixableCopyField = (typeof FIXABLE_COPY_FIELDS)[number];
export const COPY_LIMITS: Readonly<Record<FixableCopyField, number>> = {
  primary_text: 125,
  headline: 40,
  description: 30,
};

export function isFixableCopyField(value: string): value is FixableCopyField {
  return FIXABLE_COPY_FIELDS.some((field) => field === value);
}

const MAX_TEXT = 2000;
const text = (max = MAX_TEXT) => z.string().max(max);

export const moderateurInputSchema = z.strictObject({
  output_language: z.enum(['fr', 'en']),
  ad: z.strictObject({
    product: text(300),
    primary_text: text(),
    headline: text(300),
    description: text(300).nullable().default(null),
    /** Description du visuel (jamais l'image elle-même). */
    visual: text().default(''),
    /** Adresse de la page de destination (ou « messagerie »), avec son état si connu. */
    landing_page: text(500).nullable().default(null),
  }),
  /** Motif officiel de Meta : texte NON FIABLE (il vient d'une source externe). */
  meta_rejection: z.string().min(1).max(MAX_TEXT),
});
export type ModerateurInput = z.input<typeof moderateurInputSchema>;
export type ParsedModerateurInput = z.infer<typeof moderateurInputSchema>;

/** Mots que Meta et Pubeka évitent dans une correction (superlatifs invérifiables, « garanti », « 100 % »). */
const FORBIDDEN =
  /garanti|100\s?%|le meilleur|la meilleure|les meilleur|n[°o]\s?1\b|#1\b|guaranteed|the best|number one/i;
const HTML = /<\s*[a-zA-Z/!]/;

/** Comparaison tolérante : casse, apostrophes typographiques, espaces multiples. */
export function normalizeForMatch(value: string): string {
  return value
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function appearsIn(excerpt: string, haystack: string): boolean {
  return normalizeForMatch(haystack).includes(normalizeForMatch(excerpt));
}

const baseOutputSchema = z.strictObject({
  rejection_category: z.enum(REJECTION_CATEGORIES),
  culprit: z.strictObject({
    where: z.enum(CULPRIT_PLACES),
    excerpt: z.string().max(500).nullable(),
  }),
  cause_certainty: z.enum(['high', 'medium', 'low']),
  can_fix: z.boolean(),
  fix: z
    .strictObject({
      field: z.string().min(1).max(40),
      original: z.string().max(MAX_TEXT).nullable(),
      suggested: z.string().min(1).max(MAX_TEXT),
    })
    .nullable(),
  appeal_recommended: z.boolean(),
  report: z.string().min(1).max(1200),
  memory_pattern: z.string().min(1).max(200),
});
export type ModerateurOutput = z.infer<typeof baseOutputSchema>;

/** Rapport tel qu'il est enregistré (sortie du modèle + signalements internes), relu avec tolérance. */
export const moderateurStoredSchema = baseOutputSchema.extend({
  flags: z.array(z.string()).optional(),
});
export type ModerateurStored = z.infer<typeof moderateurStoredSchema>;

/** Phrases du rapport : « 3 à 5 phrases » (docs/agents/04 §7), tolérance de 6 comme le banc. */
function sentenceCount(report: string): number {
  return report.split(/[.!?]+\s/).filter((part) => part.trim() !== '').length;
}

/**
 * Schéma de sortie pour UNE entrée : les règles qui dépendent de la publicité (l'élément cité doit y figurer, la correction
 * n'invente aucun chiffre) sont appliquées ici par le code.
 */
export function moderateurOutputSchemaFor(
  input: ParsedModerateurInput,
): z.ZodType<ModerateurOutput> {
  const fields: Record<FixableCopyField, string> = {
    primary_text: input.ad.primary_text,
    headline: input.ad.headline,
    description: input.ad.description ?? '',
  };
  const allAdText = Object.values(fields).join(' ');
  const knownNumbers = new Set(numbersIn(allAdText));

  return baseOutputSchema.superRefine((out, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: 'custom', path, message });
    };

    // Produit interdit : on explique, on ne propose aucune republication (APPFLOW §12.5).
    if (!out.can_fix && out.fix !== null) {
      issue(['fix'], 'can_fix est faux : fix doit être null (aucune republication)');
    }
    if (!out.can_fix && out.appeal_recommended) {
      issue(['appeal_recommended'], 'un produit interdit par Meta ne se conteste pas');
    }
    // Honnêteté sur un motif vague (docs/agents/04 §7).
    if (out.cause_certainty === 'low' && !out.appeal_recommended && out.can_fix) {
      issue(['appeal_recommended'], 'cause incertaine : un nouvel examen doit être conseillé');
    }
    if (out.cause_certainty === 'high' && out.culprit.where === 'unknown') {
      issue(
        ['cause_certainty'],
        'certitude « high » impossible quand l’élément en cause est inconnu',
      );
    }
    const sentences = sentenceCount(out.report);
    if (sentences < 2 || sentences > 6) {
      issue(['report'], 'le rapport doit faire 3 à 5 phrases');
    }

    // L'élément cité doit se trouver dans le texte qu'il désigne : aucune citation inventée.
    const place = out.culprit.where;
    if (out.culprit.excerpt !== null && isFixableCopyField(place)) {
      if (!appearsIn(out.culprit.excerpt, fields[place])) {
        issue(['culprit', 'excerpt'], `l’extrait cité ne figure pas dans « ${place} »`);
      }
    }

    if (out.fix === null) return;
    const field = out.fix.field;
    if (!isFixableCopyField(field)) return;
    if (out.fix.original !== null && !appearsIn(out.fix.original, fields[field])) {
      issue(['fix', 'original'], `le texte d’origine ne figure pas dans « ${field} »`);
    }
    const suggested = out.fix.suggested;
    if (codePoints(suggested) > COPY_LIMITS[field]) {
      issue(['fix', 'suggested'], `${field} : ${String(COPY_LIMITS[field])} caractères au plus`);
    }
    if (normalizeForMatch(suggested) === normalizeForMatch(fields[field])) {
      issue(['fix', 'suggested'], 'la correction est identique au texte refusé');
    }
    if (HTML.test(suggested)) issue(['fix', 'suggested'], 'pas de HTML');
    if (FORBIDDEN.test(suggested)) {
      issue(['fix', 'suggested'], 'mot interdit (superlatif invérifiable, « garanti », « 100 % »)');
    }
    if ((suggested.match(/!/g) ?? []).length > 1) {
      issue(['fix', 'suggested'], 'un seul point d’exclamation');
    }
    // R3 : la correction ne contient aucun chiffre (prix, délai, promotion) absent de la publicité d'origine.
    for (const number of numbersIn(suggested)) {
      if (!knownNumbers.has(number)) {
        issue(['fix', 'suggested'], `chiffre « ${number} » absent de la publicité d’origine`);
      }
    }
  });
}
