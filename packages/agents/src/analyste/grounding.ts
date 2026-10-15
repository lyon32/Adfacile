// Règle R3 appliquée par le CODE (docs/agents/README) : aucune valeur sans source. Le prompt le demande au modèle ;
// ce module le vérifie, parce qu'un numéro, un prix ou une adresse inventés produisent une publicité fausse payée par
// le client. Une valeur que l'on ne retrouve dans aucune source (ni dans le kit de marque) est retirée (`null`), ajoutée
// à `missing`, et la fiche reçoit le signalement `UNGROUNDED_VALUE_REMOVED`. On ne « corrige » jamais par une autre valeur.
import type { AnalysteOutput } from './schema';

export const UNGROUNDED_FLAG = 'UNGROUNDED_VALUE_REMOVED';

export interface GroundingInput {
  /** Textes des sources (pages, documents, descriptions, adresses), tels que lus par le code. */
  texts: readonly string[];
  /** Valeurs du kit de marque : elles sont aussi des sources (APPFLOW §8.2, réponses pré-remplies). */
  brandKit?: { phone?: string | null | undefined; whatsapp?: string | null | undefined } | null;
  /**
   * Des photos ont été envoyées : leur texte (numéro sur un flyer, nom sur une enseigne) n'est lu que par le modèle,
   * pas par le code. Ces valeurs ne sont alors pas retirées mais listées dans `unverified` (signalement
   * `IMAGE_VALUES_UNVERIFIED`) : jamais présentées comme vérifiées.
   */
  hasImages?: boolean;
  /** Index des sources qui sont des photos : un prix cité d'une photo n'est pas retiré. */
  imageSources?: readonly number[];
}

/** Minuscules, sans accents, tout ce qui n'est pas lettre ou chiffre devient une espace (« chez-mama » = « chez mama »). */
function plain(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

function digits(text: string): string {
  return text.replace(/\D/g, '');
}

/** Retire les séparateurs de milliers entre chiffres : « 25 000 », « 25.000 », « 25,000 » deviennent « 25000 ». */
function compactNumbers(text: string): string {
  return text.replace(/(?<=\d)[\s.,'’  ](?=\d{3}(?!\d))/g, '');
}

class Corpus {
  private readonly raw: string[];
  private readonly plainAll: string;
  private readonly digitRuns: string[];
  private readonly compact: string;

  constructor(texts: readonly string[], extra: readonly string[]) {
    this.raw = [...texts, ...extra];
    this.plainAll = plain(this.raw.join('\n'));
    this.digitRuns = this.raw.map(digits);
    this.compact = compactNumbers(this.raw.join('\n'));
  }

  hasWords(value: string): boolean {
    const needle = plain(value).trim();
    return needle !== '' && this.plainAll.includes(` ${needle} `);
  }

  /** Un numéro est retrouvé s'il apparaît en chiffres (avec ou sans indicatif) dans une même source. */
  hasPhone(value: string): boolean {
    const number = digits(value);
    if (number.length < 6) return false;
    const national = number.length > 8 ? number.slice(-8) : number;
    return this.digitRuns.some((run) => run.includes(number) || run.includes(national));
  }

  hasNumber(amount: number): boolean {
    const wanted = String(amount);
    return new RegExp(`(?<![\\d])${wanted.replace('.', '[.,]')}(?![\\d])`).test(this.compact);
  }
}

export const IMAGE_UNVERIFIED_FLAG = 'IMAGE_VALUES_UNVERIFIED';

export interface GroundingResult {
  output: AnalysteOutput;
  /** Valeurs non retrouvées dans le texte mais conservées parce que des photos ont été envoyées. */
  unverified: string[];
  /** Chemins des valeurs retirées (pour le journal). */
  removed: string[];
}

export function groundProfile(output: AnalysteOutput, input: GroundingInput): GroundingResult {
  const extra = [input.brandKit?.phone, input.brandKit?.whatsapp].filter(
    (v): v is string => typeof v === 'string',
  );
  const corpus = new Corpus(input.texts, extra);
  const fromImage = (source: number | null): boolean =>
    source !== null && (input.imageSources?.includes(source) ?? false);
  const removed: string[] = [];
  const unverified: string[] = [];
  const images = input.hasImages === true;
  /** Retire la valeur, ou la garde « non vérifiée » si une photo peut en être l'origine. */
  const drop = (path: string, fromImage = images): boolean => {
    if (fromImage) {
      unverified.push(path);
      return false;
    }
    removed.push(path);
    return true;
  };
  const profile = structuredClone(output.profile);

  const { contacts } = profile;
  for (const key of ['whatsapp', 'phone'] as const) {
    const value = contacts[key];
    if (value !== null && !corpus.hasPhone(value) && drop(`profile.contacts.${key}`)) {
      contacts[key] = null;
    }
  }
  if (
    contacts.website !== null &&
    !corpus.hasWords(contacts.website.replace(/^https?:\/\//i, '')) &&
    drop('profile.contacts.website')
  ) {
    contacts.website = null;
  }
  if (
    contacts.instagram !== null &&
    !corpus.hasWords(contacts.instagram.replace(/^@/, '')) &&
    drop('profile.contacts.instagram')
  ) {
    contacts.instagram = null;
  }

  profile.products.forEach((product, i) => {
    if (
      product.price !== null &&
      !corpus.hasNumber(product.price.amount) &&
      drop(`profile.products.${String(i)}.price`, images && fromImage(product.source))
    ) {
      product.price = null;
    }
  });

  profile.locations.forEach((location, i) => {
    for (const key of ['city', 'area'] as const) {
      const value = location[key];
      if (
        value !== null &&
        !corpus.hasWords(value) &&
        drop(`profile.locations.${String(i)}.${key}`)
      ) {
        location[key] = null;
      }
    }
  });

  if (
    profile.business_name.value !== null &&
    !corpus.hasWords(profile.business_name.value) &&
    drop('profile.business_name')
  ) {
    profile.business_name = { value: null, source: null };
  }

  const flagged = (flags: string[]): string[] => {
    let next = flags;
    if (removed.length > 0 && !next.includes(UNGROUNDED_FLAG)) next = [...next, UNGROUNDED_FLAG];
    if (unverified.length > 0 && !next.includes(IMAGE_UNVERIFIED_FLAG))
      next = [...next, IMAGE_UNVERIFIED_FLAG];
    return next;
  };
  if (removed.length === 0) {
    return unverified.length === 0
      ? { output, removed, unverified }
      : { output: { ...output, flags: flagged(output.flags) }, removed, unverified };
  }
  const missing = [...output.missing];
  for (const path of removed) {
    const field = path.replace(/^profile\./, '').replace(/\.price$/, '');
    if (!missing.includes(field)) missing.push(field);
  }
  return {
    output: { ...output, profile, missing, flags: flagged(output.flags) },
    removed,
    unverified,
  };
}
