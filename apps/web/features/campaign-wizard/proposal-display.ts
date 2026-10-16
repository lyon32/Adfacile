// Ce que la carte « Proposition » affiche : un modèle unique, rempli soit par une proposition, soit par la campagne
// (après choix et modifications), soit par l'aperçu progressif du flux (champs encore absents = `null`).
import type { Campaign, Destination, MoneyView, Objective, ProposalBody } from './proposal-api';
import { OBJECTIVES, DESTINATIONS, CTAS } from './proposal-api';
import type { Preview } from './proposal-model';

export interface Display {
  objective: Objective | null;
  objectiveReason: string | null;
  destination: Destination | null;
  cities: { name: string; radiusKm: number }[] | null;
  countries: string[];
  zoneReason: string | null;
  budgetUsdCents: number | null;
  dailyMoney: MoneyView | null;
  budgetReason: string | null;
  startDate: string | null;
  endDate: string | null;
  scheduleReason: string | null;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  cta: (typeof CTAS)[number] | null;
  warnings: string[];
}

export const EMPTY_DISPLAY: Display = {
  objective: null,
  objectiveReason: null,
  destination: null,
  cities: null,
  countries: [],
  zoneReason: null,
  budgetUsdCents: null,
  dailyMoney: null,
  budgetReason: null,
  startDate: null,
  endDate: null,
  scheduleReason: null,
  primaryText: null,
  headline: null,
  description: null,
  cta: null,
  warnings: [],
};

export function fromProposal(body: ProposalBody, daily: MoneyView | null | undefined): Display {
  return {
    objective: body.objective,
    objectiveReason: body.objective_reason === '' ? null : body.objective_reason,
    destination: body.destination,
    cities: body.geo.cities.map((c) => ({ name: c.name, radiusKm: c.radius_km })),
    countries: body.geo.countries,
    zoneReason: body.geo.reason === '' ? null : body.geo.reason,
    budgetUsdCents: body.budget.daily_usd_cents,
    dailyMoney: daily ?? null,
    budgetReason: body.budget.reason === '' ? null : body.budget.reason,
    startDate: body.schedule.start_date,
    endDate: body.schedule.end_date,
    scheduleReason: body.schedule.reason === '' ? null : body.schedule.reason,
    primaryText: body.copy.primary_text,
    headline: body.copy.headline,
    description: body.copy.description,
    cta: body.copy.cta,
    warnings: body.warnings,
  };
}

/** La campagne retenue (avec les modifications de la personne) ; les justifications restent celles de la proposition. */
export function fromCampaign(campaign: Campaign, source: ProposalBody | null): Display {
  const base = source === null ? EMPTY_DISPLAY : fromProposal(source, null);
  return {
    ...base,
    objective: campaign.objective ?? base.objective,
    destination: campaign.destination ?? base.destination,
    cities: (campaign.geo.cities ?? []).map((c) => ({ name: c.name, radiusKm: c.radius_km })),
    countries: campaign.geo.countries ?? base.countries,
    budgetUsdCents: campaign.daily_budget_usd_cents ?? base.budgetUsdCents,
    dailyMoney: campaign.cost.daily ?? null,
    startDate: campaign.start_date ?? base.startDate,
    endDate: campaign.end_date ?? base.endDate,
    primaryText: campaign.copy.primary_text ?? base.primaryText,
    headline: campaign.copy.headline ?? base.headline,
    description: campaign.copy.description ?? base.description,
    cta: campaign.copy.cta ?? base.cta,
  };
}

function text(preview: Preview, ...path: string[]): string | null {
  let node: unknown = preview;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' ? node : null;
}

function num(preview: Preview, ...path: string[]): number | null {
  let node: unknown = preview;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'number' ? node : null;
}

function pick<T extends string>(list: readonly T[], value: string | null): T | null {
  return list.find((item) => item === value) ?? null;
}

/** Aperçu non contractuel du flux : seuls les champs déjà terminés sont remplis. */
export function fromPreview(preview: Preview): Display {
  const geo =
    typeof preview.geo === 'object' && preview.geo !== null ? (preview.geo as Preview) : {};
  const rawCities = Array.isArray(geo.cities) ? (geo.cities as unknown[]) : [];
  const cities = rawCities.flatMap((item) => {
    const name = text({ item }, 'item', 'name');
    const radius = num({ item }, 'item', 'radius_km');
    return name === null || radius === null ? [] : [{ name, radiusKm: radius }];
  });
  const countries = Array.isArray(geo.countries)
    ? (geo.countries as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  return {
    ...EMPTY_DISPLAY,
    objective: pick(OBJECTIVES, text(preview, 'objective')),
    objectiveReason: text(preview, 'objective_reason'),
    destination: pick(DESTINATIONS, text(preview, 'destination')),
    cities: cities.length > 0 || countries.length > 0 ? cities : null,
    countries,
    zoneReason: text(preview, 'geo', 'reason'),
    budgetUsdCents: num(preview, 'budget', 'daily_usd_cents'),
    budgetReason: text(preview, 'budget', 'reason'),
    startDate: text(preview, 'schedule', 'start_date'),
    endDate: text(preview, 'schedule', 'end_date'),
    scheduleReason: text(preview, 'schedule', 'reason'),
    primaryText: text(preview, 'copy', 'primary_text'),
    headline: text(preview, 'copy', 'headline'),
    description: text(preview, 'copy', 'description'),
    cta: pick(CTAS, text(preview, 'copy', 'cta')),
  };
}
