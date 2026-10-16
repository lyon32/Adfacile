// Règles pures de l'étape « Proposition » (aucun React, aucun réseau) : aperçu progressif, saisie du budget en dollars sans
// flottant, validation du formulaire de modification (mêmes limites que le serveur, qui revalide tout : SECURITY_NOTES §3.2),
// construction du PATCH. Les montants sont des ENTIERS (centimes de dollar).
import type { Campaign, CampaignPatchBody, CTAS, Destination, Objective } from './proposal-api';
import { OBJECTIVE_DESTINATIONS } from './proposal-api';

// ---- Aperçu progressif -----------------------------------------------------------------------------------------------------

export type Preview = Record<string, unknown>;

/** Range une valeur annoncée par le flux à son chemin (`geo.cities.0.name`) ; l'entrée n'est pas modifiée. */
export function applyField(preview: Preview, path: string, value: unknown): Preview {
  const segments = path.split('.');
  const set = (node: unknown, depth: number): unknown => {
    const key = segments[depth];
    if (key === undefined) return value;
    const isIndex = /^\d+$/.test(key);
    if (isIndex) {
      const list = Array.isArray(node) ? [...(node as unknown[])] : [];
      list[Number(key)] = set(list[Number(key)], depth + 1);
      return list;
    }
    const record =
      typeof node === 'object' && node !== null && !Array.isArray(node)
        ? { ...(node as Preview) }
        : {};
    record[key] = set(record[key], depth + 1);
    return record;
  };
  return set(preview, 0) as Preview;
}

export function previewText(preview: Preview, path: string): string | null {
  let node: unknown = preview;
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' || typeof node === 'number' ? String(node) : null;
}

// ---- Dollars <-> centimes ------------------------------------------------------------------------------------------------------

/** « 4 », « 4.5 », « 4,50 » → 400, 450, 450. Refuse tout le reste (jamais de flottant). */
export function parseUsdInput(text: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (match === null) return null;
  const cents = Number(match[2] === undefined ? '0' : match[2].padEnd(2, '0'));
  return Number(match[1]) * 100 + cents;
}

/**
 * Estimation en FCFA d'un budget en centimes : calcul en entiers (taux au dix-millième, arrondi à la demi-unité vers le
 * haut), comme le serveur. C'est une AIDE de saisie : le montant qui fait foi est celui du serveur. Taux inconnu → null.
 */
export function estimateXaf(cents: number, xafPerUsd: number): number | null {
  if (!Number.isFinite(xafPerUsd) || xafPerUsd <= 0 || !Number.isSafeInteger(cents) || cents < 0)
    return null;
  const scaled = BigInt(Math.round(xafPerUsd * 10_000));
  return Number((BigInt(cents) * scaled + 500_000n) / 1_000_000n);
}

export function usdInputFromCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(whole) : `${String(whole)}.${String(rest).padStart(2, '0')}`;
}

// ---- Formulaire de modification ----------------------------------------------------------------------------------------------

export interface EditForm {
  objective: Objective;
  destination: Destination;
  budget: string;
  startDate: string;
  endDate: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: (typeof CTAS)[number];
  cities: { name: string; radius: string }[];
}

export const LIMITS = { primaryText: 125, headline: 40, description: 30 } as const;
export const MIN_BUDGET_CENTS = 100;
export const MAX_BUDGET_CENTS = 1_000_000;

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function formFromCampaign(campaign: Campaign): EditForm | null {
  const { objective, destination } = campaign;
  if (
    objective === undefined ||
    objective === null ||
    destination === undefined ||
    destination === null
  ) {
    return null;
  }
  return {
    objective,
    destination,
    budget: usdInputFromCents(campaign.daily_budget_usd_cents ?? MIN_BUDGET_CENTS),
    startDate: campaign.start_date ?? '',
    endDate: campaign.end_date ?? '',
    primaryText: campaign.copy.primary_text ?? '',
    headline: campaign.copy.headline ?? '',
    description: campaign.copy.description ?? '',
    cta: campaign.copy.cta ?? 'LEARN_MORE',
    cities: (campaign.geo.cities ?? []).map((c) => ({ name: c.name, radius: String(c.radius_km) })),
  };
}

export type FormErrorKey =
  | 'budget_invalid'
  | 'budget_too_low'
  | 'budget_too_high'
  | 'start_past'
  | 'start_invalid'
  | 'end_invalid'
  | 'end_before_start'
  | 'span_too_long'
  | 'primary_required'
  | 'primary_too_long'
  | 'headline_required'
  | 'headline_too_long'
  | 'description_too_long'
  | 'html'
  | 'city_name'
  | 'city_radius'
  | 'destination_mismatch';

export type FormErrors = Partial<Record<string, FormErrorKey>>;

const HTML = /<\s*[a-zA-Z/!]/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function realDate(value: string): number | null {
  if (!DATE.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time;
}

/** `today` : AAAA-MM-JJ dans le fuseau de la personne (le serveur refait ce contrôle avec ITS horloge). */
export function validateForm(form: EditForm, today: string): FormErrors {
  const errors: FormErrors = {};
  const cents = parseUsdInput(form.budget);
  if (cents === null) errors.budget = 'budget_invalid';
  else if (cents < MIN_BUDGET_CENTS) errors.budget = 'budget_too_low';
  else if (cents > MAX_BUDGET_CENTS) errors.budget = 'budget_too_high';

  const start = realDate(form.startDate);
  const end = realDate(form.endDate);
  if (start === null) errors.startDate = 'start_invalid';
  else if (form.startDate < today) errors.startDate = 'start_past';
  if (end === null) errors.endDate = 'end_invalid';
  else if (start !== null && end <= start) errors.endDate = 'end_before_start';
  else if (start !== null && (end - start) / 86_400_000 + 1 > 365) errors.endDate = 'span_too_long';

  const checkText = (field: string, value: string, max: number, required: boolean): void => {
    if (required && value.trim() === '')
      errors[field] = field === 'primaryText' ? 'primary_required' : 'headline_required';
    else if (codePointLength(value) > max) {
      errors[field] =
        field === 'primaryText'
          ? 'primary_too_long'
          : field === 'headline'
            ? 'headline_too_long'
            : 'description_too_long';
    } else if (HTML.test(value)) errors[field] = 'html';
  };
  checkText('primaryText', form.primaryText, LIMITS.primaryText, true);
  checkText('headline', form.headline, LIMITS.headline, true);
  checkText('description', form.description, LIMITS.description, false);

  form.cities.forEach((city, index) => {
    if (city.name.trim() === '' || HTML.test(city.name))
      errors[`city.${String(index)}.name`] = 'city_name';
    const radius = /^\d{1,3}$/.test(city.radius) ? Number(city.radius) : -1;
    if (radius < 1 || radius > 80) errors[`city.${String(index)}.radius`] = 'city_radius';
  });
  if (!OBJECTIVE_DESTINATIONS[form.objective].includes(form.destination))
    errors.destination = 'destination_mismatch';
  return errors;
}

/** Changer d'objectif garde la destination si elle convient, sinon prend la première destination permise. */
export function withObjective(form: EditForm, objective: Objective): EditForm {
  const allowed = OBJECTIVE_DESTINATIONS[objective];
  return {
    ...form,
    objective,
    destination: allowed.includes(form.destination)
      ? form.destination
      : (allowed[0] ?? form.destination),
  };
}

/** Le PATCH ne contient que ce qui a changé, avec la version lue (verrou optimiste). */
export function buildPatch(form: EditForm, campaign: Campaign): CampaignPatchBody | null {
  const initial = formFromCampaign(campaign);
  const patch: CampaignPatchBody = { version: campaign.version };
  if (form.objective !== initial?.objective) {
    patch.objective = form.objective;
  }
  if (form.destination !== initial?.destination) {
    patch.destination = form.destination;
  }
  const cents = parseUsdInput(form.budget);
  if (cents !== null && cents !== campaign.daily_budget_usd_cents) {
    patch.daily_budget_usd_cents = cents;
  }
  if (form.startDate !== initial?.startDate) {
    patch.start_date = form.startDate;
  }
  if (form.endDate !== initial?.endDate) {
    patch.end_date = form.endDate;
  }
  const copy: NonNullable<CampaignPatchBody['copy']> = {};
  if (form.primaryText !== initial?.primaryText) copy.primary_text = form.primaryText;
  if (form.headline !== initial?.headline) copy.headline = form.headline;
  if (form.description !== initial?.description) copy.description = form.description;
  if (form.cta !== initial?.cta) copy.cta = form.cta;
  if (Object.keys(copy).length > 0) {
    patch.copy = copy;
  }
  const cities = form.cities.map((c) => ({ name: c.name.trim(), radius_km: Number(c.radius) }));
  const before = initial?.cities.map((c) => ({ name: c.name, radius_km: Number(c.radius) })) ?? [];
  if (JSON.stringify(cities) !== JSON.stringify(before)) {
    patch.geo = { countries: campaign.geo.countries ?? [], cities };
  }
  // Seule la version : rien n'a changé.
  return Object.keys(patch).length > 1 ? patch : null;
}
