// Règles de validation des champs d'une campagne (SECURITY_NOTES §3.2) ; la forme (types, champs inconnus) est déjà
// vérifiée par le schéma Zod de la route, ici ce sont les règles qui dépendent de la date du jour et d'autres champs.
// Utilisé par la modification d'un brouillon et par le choix d'une proposition : une seule définition des limites.
//
//  - budget par jour : ≥ 100 centimes (1 $, TR-PLA-10) sinon 422 `budget_too_low` ; ≤ 1 000 000 centimes sinon 400 ;
//  - dates : début ≥ aujourd'hui (dans le fuseau de l'utilisateur), fin > début (deux jours au moins), durée ≤ 365 jours DÉBUT ET FIN COMPRIS ;
//  - textes : 125 / 40 / 30 caractères, mesurés en POINTS DE CODE (un émoji = 1), pas de HTML ;
//  - un champ qui n'est pas modifié n'est pas revalidé : un ancien brouillon reste modifiable sur un autre point.
import { OBJECTIVE_DESTINATIONS } from '@pubeka/agents';
import { AppError, type FieldError } from '@pubeka/contracts';
import { daysInclusive } from './cost';

export const MIN_DAILY_BUDGET_USD_CENTS = 100;
export const MAX_DAILY_BUDGET_USD_CENTS = 1_000_000;
/** Durée maximale, début et fin compris (SECURITY_NOTES §3.2). */
export const MAX_CAMPAIGN_DAYS = 365;
export const COPY_LIMITS = { primary_text: 125, headline: 40, description: 30 } as const;
export const MAX_INTERESTS = 15;
export const MAX_CITIES = 20;
export const MAX_COUNTRIES = 20;
export const MAX_CITY_RADIUS_KM = 80;

export interface CampaignFields {
  objective: string | null;
  destination: string | null;
  dailyBudgetUsdCents: number | null;
  startDate: string | null;
  endDate: string | null;
  copy: {
    primary_text?: string | undefined;
    headline?: string | undefined;
    description?: string | null | undefined;
  };
  targeting: {
    age_min?: number | undefined;
    age_max?: number | undefined;
    interests?: { name: string }[] | undefined;
  };
  geo: {
    countries?: string[] | undefined;
    cities?: { name: string; radius_km: number }[] | undefined;
  };
}

/** Longueur en points de code Unicode (SECURITY_NOTES §3.1 règle 4). */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Une balise HTML ou un commentaire : `<` suivi d'une lettre, de `/` ou de `!`. Un « < » seul reste permis. */
const HTML_TAG = /<\s*[a-zA-Z/!]/;

export function containsHtml(text: string): boolean {
  return HTML_TAG.test(text);
}

function isDate(value: string): boolean {
  return daysInclusive(value, value) === 1;
}

function lookupDestinations(objective: string): readonly string[] | undefined {
  return Object.entries(OBJECTIVE_DESTINATIONS).find(([key]) => key === objective)?.[1];
}

export function checkCampaignFields(
  fields: CampaignFields,
  changed: ReadonlySet<string>,
  today: string,
): void {
  const errors: FieldError[] = [];
  const add = (field: string, code: FieldError['code'], message: string): void => {
    errors.push({ field, code, message });
  };
  let budgetTooLow = false;

  // Objectif et destination
  if (changed.has('objective') || changed.has('destination')) {
    const allowed = fields.objective === null ? undefined : lookupDestinations(fields.objective);
    if (
      allowed !== undefined &&
      fields.destination !== null &&
      !allowed.includes(fields.destination)
    ) {
      add('destination', 'invalid_value', 'Cette destination ne correspond pas à l’objectif.');
    }
  }

  // Budget
  if (changed.has('daily_budget_usd_cents') && fields.dailyBudgetUsdCents !== null) {
    const budget = fields.dailyBudgetUsdCents;
    if (budget > MAX_DAILY_BUDGET_USD_CENTS) {
      add('daily_budget_usd_cents', 'too_large', 'Le budget maximum est de 10 000 $ par jour.');
    } else if (budget < MIN_DAILY_BUDGET_USD_CENTS) {
      budgetTooLow = true;
      add('daily_budget_usd_cents', 'too_small', 'Le budget minimum est de 1 $ par jour.');
    }
  }

  // Dates
  if (changed.has('start_date') || changed.has('end_date')) {
    const { startDate, endDate } = fields;
    const startOk = startDate !== null && isDate(startDate);
    const endOk = endDate !== null && isDate(endDate);
    if (changed.has('start_date') && startDate !== null && !startOk) {
      add('start_date', 'invalid_format', 'Date attendue au format AAAA-MM-JJ.');
    }
    if (changed.has('end_date') && endDate !== null && !endOk) {
      add('end_date', 'invalid_format', 'Date attendue au format AAAA-MM-JJ.');
    }
    if (changed.has('start_date') && startOk && startDate < today) {
      add('start_date', 'invalid_value', 'La date de début ne peut pas être passée.');
    }
    if (startOk && endOk) {
      const days = daysInclusive(startDate, endDate) ?? 0;
      if (endDate <= startDate) {
        add('end_date', 'invalid_value', 'La date de fin doit suivre la date de début.');
      } else if (days > MAX_CAMPAIGN_DAYS) {
        add('end_date', 'too_large', 'Une campagne dure 365 jours au plus, début et fin compris.');
      }
    }
  }

  // Textes
  if (changed.has('copy')) {
    const { copy } = fields;
    for (const key of ['primary_text', 'headline', 'description'] as const) {
      const value = copy[key];
      if (value === undefined || value === null) continue;
      const path = `copy.${key}`;
      if (value === '' && key !== 'description') {
        add(path, 'required', 'Ce texte est obligatoire.');
      } else if (codePointLength(value) > COPY_LIMITS[key]) {
        add(path, 'too_long', `${String(COPY_LIMITS[key])} caractères au maximum.`);
      } else if (containsHtml(value)) {
        add(path, 'invalid_format', 'Le HTML n’est pas permis.');
      }
    }
  }

  // Ciblage
  if (changed.has('targeting')) {
    const { age_min: min, age_max: max, interests } = fields.targeting;
    if (min !== undefined && max !== undefined && min > max) {
      add('targeting.age_min', 'invalid_value', 'L’âge minimum dépasse l’âge maximum.');
    }
    if (interests !== undefined) {
      if (interests.length > MAX_INTERESTS) {
        add(
          'targeting.interests',
          'too_long',
          `${String(MAX_INTERESTS)} centres d’intérêt au maximum.`,
        );
      }
      interests.forEach((interest, index) => {
        if (containsHtml(interest.name)) {
          add(
            `targeting.interests.${String(index)}.name`,
            'invalid_format',
            'Le HTML n’est pas permis.',
          );
        }
      });
    }
  }

  // Zone
  if (changed.has('geo')) {
    const { countries = [], cities = [] } = fields.geo;
    if (countries.length === 0 && cities.length === 0) {
      add('geo', 'required', 'Indique au moins un pays ou une ville.');
    }
    if (countries.length > MAX_COUNTRIES) add('geo.countries', 'too_long', 'Trop de pays.');
    if (cities.length > MAX_CITIES) add('geo.cities', 'too_long', 'Trop de villes.');
    cities.forEach((city, index) => {
      if (city.radius_km < 1 || city.radius_km > MAX_CITY_RADIUS_KM) {
        add(`geo.cities.${String(index)}.radius_km`, 'invalid_value', 'Rayon de 1 à 80 km.');
      }
      if (containsHtml(city.name)) {
        add(`geo.cities.${String(index)}.name`, 'invalid_format', 'Le HTML n’est pas permis.');
      }
    });
  }

  if (errors.length === 0) return;
  if (budgetTooLow && errors.length === 1) {
    throw new AppError('budget_too_low', { meta: { min_usd_cents: MIN_DAILY_BUDGET_USD_CENTS } });
  }
  throw new AppError('validation_failed', { errors });
}
