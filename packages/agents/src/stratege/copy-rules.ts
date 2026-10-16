// Règles sur les textes d'une proposition, appliquées par le CODE (le prompt ne peut que les demander) :
//  - R3 : aucun prix, numéro, adresse ou promotion qui ne vienne pas de la fiche, des réponses ou du kit de marque ;
//  - limites de caractères (en points de code), pas de HTML ;
//  - mots interdits (superlatifs invérifiables, « garanti », « 100 % ») ; un seul point d'exclamation ; 2 émojis au plus (R6) ;
//  - ton : « vous » strict ou « tu » strict, jamais de mélange (TR-AGT-05).
// Les contrôles de ton et de mots interdits reprennent ceux du banc (bench/scoring.mjs) pour que le banc et l'application
// jugent de la même façon.

export interface CopyContext {
  language: 'fr' | 'en';
  address: 'vous' | 'tu';
  /** Nombres écrits dans les sources, séparateurs retirés (« 25 000 » → « 25000 »). */
  numbers: ReadonlySet<string>;
  /** Suites de chiffres des sources (numéros de téléphone), pour accepter un numéro avec ou sans indicatif. */
  digitRuns: readonly string[];
  /** Texte des sources en minuscules, pour retrouver une adresse ou un identifiant de réseau social. */
  haystack: string;
}

export interface CopyFields {
  copy: { primary_text: string; headline: string; description: string | null };
  visual_brief: string;
}

export interface Violation {
  path: (string | number)[];
  message: string;
}

const LIMITS = { primary_text: 125, headline: 40, description: 30 } as const;
const NUMBER = /\d+(?:[\s  .,'’]\d{3})*(?:[.,]\d+)?/g;
const HTML = /<\s*[a-zA-Z/!]/;
const FORBIDDEN =
  /garanti|100\s?%|le meilleur|la meilleure|les meilleur|n[°o]\s?1\b|#1\b|guaranteed|the best|number one/i;
const LINK = /(https?:\/\/[^\s)]+|www\.[^\s)]+|@[\p{L}\d_.]{2,})/giu;

export function codePoints(text: string): number {
  return Array.from(text).length;
}

/** Séparateurs retirés : « 25 000 », « 25.000 » et « 25,000 » deviennent « 25000 ». */
export function compactNumber(token: string): string {
  return token.replace(/[\s  .,'’]/g, '');
}

export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(compactNumber);
}

/** Toutes les feuilles texte et nombre d'une valeur JSON (fiche, réponses, kit de marque). */
function leaves(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'number' && Number.isFinite(value)) out.push(String(value));
  else if (Array.isArray(value)) for (const item of value) leaves(item, out);
  else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) leaves(item, out);
  }
}

export function buildCopyContext(args: {
  language: 'fr' | 'en';
  address: 'vous' | 'tu';
  sources: readonly unknown[];
}): CopyContext {
  const texts: string[] = [];
  for (const source of args.sources) leaves(source, texts);
  const numbers = new Set<string>();
  for (const t of texts) for (const n of numbersIn(t)) numbers.add(n);
  return {
    language: args.language,
    address: args.address,
    numbers,
    digitRuns: texts.map((t) => t.replace(/\D/g, '')).filter((d) => d.length >= 6),
    haystack: texts.join('\n').toLowerCase(),
  };
}

function numberGrounded(token: string, context: CopyContext): boolean {
  if (context.numbers.has(token)) return true;
  // Un numéro de téléphone se retrouve avec ou sans l'indicatif du pays.
  if (token.length >= 6) {
    const national = token.length > 8 ? token.slice(-8) : token;
    return context.digitRuns.some((run) => run.includes(token) || run.includes(national));
  }
  return false;
}

const TU_FORMS = /(?:^|[\s'’(])(?:(?:tu|ton|ta|tes|toi)(?=[\s,.!?'’)]|$)|t['’](?=\p{L}))/u;
const TU_IMPERATIVES = /(?:^|[\s'’(])(écris|profite|découvre|choisis|viens)(?=[\s,.!?)]|$)/u;
const VOUS_FORMS = /(?:^|[\s'’(])(vous|votre|vos)(?=[\s,.!?'’)]|$)/u;

function emojiCount(text: string): number {
  return (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

export function checkCopy(out: CopyFields, context: CopyContext): Violation[] {
  const violations: Violation[] = [];
  const add = (path: (string | number)[], message: string) => {
    violations.push({ path, message });
  };
  const fields = [
    ['primary_text', out.copy.primary_text],
    ['headline', out.copy.headline],
    ['description', out.copy.description],
  ] as const;

  for (const [key, value] of fields) {
    if (value === null) continue;
    const path = ['copy', key];
    const length = codePoints(value);
    if (length > LIMITS[key]) {
      add(
        path,
        `fait ${String(length)} caractères, la limite est ${String(LIMITS[key])} : raccourcis`,
      );
    }
    if (HTML.test(value)) add(path, 'ne doit contenir aucun HTML');
  }

  const all = fields.flatMap(([key, value]) => (value === null ? [] : [[key, value] as const]));
  const joined = all.map(([, v]) => v).join(' ');
  if (FORBIDDEN.test(joined)) {
    add(
      ['copy'],
      'contient un superlatif invérifiable ou une promesse (« garanti », « 100 % », « le meilleur », « n°1 »)',
    );
  }
  if ((joined.match(/!/g) ?? []).length > 1) add(['copy'], 'au plus un point d’exclamation');
  if (emojiCount(joined) > 2) add(['copy'], '2 émojis au maximum');

  if (context.language === 'fr') {
    const lower = ` ${joined.toLowerCase()} `;
    if (context.address === 'vous') {
      if (TU_FORMS.test(lower) || TU_IMPERATIVES.test(lower)) {
        add(
          ['copy'],
          'le vouvoiement est strict : n’utilise ni tu, ton, ta, tes, toi ni l’impératif du tutoiement',
        );
      }
    } else if (VOUS_FORMS.test(lower)) {
      add(['copy'], 'le tutoiement est strict : n’utilise ni vous, votre ni vos');
    }
  }

  // R3 : les textes destinés au public ET la consigne visuelle (le Designer écrit le prix sur l'image).
  const checked: [string, string][] = [
    ...all.map(([key, value]) => [`copy.${key}`, value] as [string, string]),
    ['visual_brief', out.visual_brief],
  ];
  for (const [path, value] of checked) {
    const segments = path.split('.');
    for (const token of numbersIn(value)) {
      if (!numberGrounded(token, context)) {
        add(
          segments,
          `contient le nombre « ${token} » qui n'est dans aucune source : retire-le (R3)`,
        );
      }
    }
    for (const link of value.match(LINK) ?? []) {
      if (!context.haystack.includes(link.toLowerCase())) {
        add(segments, `contient « ${link} » qui n'est dans aucune source : retire-le (R3)`);
      }
    }
  }
  return violations;
}

/**
 * Un fragment de texte peut-il être montré en aperçu ? Non s'il contient du HTML, un nombre ou une adresse qui ne sont dans
 * aucune source (R3) : l'aperçu ne montre jamais une invention, même si la sortie finale sera de toute façon refusée.
 */
export function previewSafe(value: string, context: CopyContext): boolean {
  if (HTML.test(value)) return false;
  if (numbersIn(value).some((token) => !numberGrounded(token, context))) return false;
  return (value.match(LINK) ?? []).every((link) => context.haystack.includes(link.toLowerCase()));
}
