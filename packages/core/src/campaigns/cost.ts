// Coût d'une campagne : budget par jour × nombre de jours + TVA du pays, en FCFA et en dollars (PRD §9.2-9.3, TR-PAY-12).
//
// Règles (CONVENTIONS §6.6, SECURITY_NOTES §3.2) :
//  - tout est en ENTIERS : centimes de dollar, FCFA. Les taux (TVA, change) arrivent de la base à 4 décimales et sont
//    ramenés en entiers (×10 000) avant tout calcul ; aucun flottant n'entre dans un montant ;
//  - arrondis explicites : TVA au centime le plus proche (0,5 monte), conversion au FCFA le plus proche (LLD §6.9) ;
//  - AUCUNE TVA ni AUCUN taux de change par défaut : une donnée absente donne un statut explicite et des totaux vides,
//    jamais une valeur plausible (le taux de TVA d'un pays est une donnée de l'administration, S31).
//
// Documents : PRD §9.2 « budget + TVA du pays = total » (ARCHITECTURE §9.3). L'exemple de l'APPFLOW §8.3
// (« 21 000 FCFA, TVA 19,25 % incluse » pour 3 000 FCFA par jour pendant 7 jours) n'est pas cohérent avec cette règle :
// on suit PRD et ARCHITECTURE (la TVA s'ajoute) ; voir le rapport de S15.
import { applyRate, usdCents, xaf } from '@pubeka/shared';

export type CostStatus = 'ok' | 'incomplete' | 'vat_not_configured' | 'fx_not_available';
export type FcfaCurrency = 'XAF' | 'XOF';

export interface CostMoney {
  xaf: number;
  usd_cents: number;
  currency: FcfaCurrency;
}

export interface CostFx {
  base: 'USD';
  quote: FcfaCurrency;
  rate: number;
  source: 'saspay' | 'fallback' | 'manual';
  fetched_at: string;
}

/** Forme de `CampaignCost` d'openapi.yaml. */
export interface CampaignCostView {
  status: CostStatus;
  vat_country: string | null;
  vat_rate: number | null;
  days: number | null;
  budget_usd_cents: number | null;
  vat_usd_cents: number | null;
  total_usd_cents: number | null;
  total: CostMoney | null;
  daily: CostMoney | null;
  fx: CostFx | null;
}

export interface CostFxInput {
  /** FCFA pour 1 dollar. */
  rate: number;
  quote: FcfaCurrency;
  source: 'saspay' | 'fallback' | 'manual';
  fetchedAt: string;
}

export interface CostInput {
  dailyBudgetUsdCents: number | null;
  /** AAAA-MM-JJ */
  startDate: string | null;
  endDate: string | null;
  /** `rate` est une fraction (0,1925 = 19,25 %) ; `null` : pas de TVA configurée pour ce pays. */
  vat: { country: string | null; rate: number | null };
  fx: CostFxInput | null;
}

const SCALE = 10_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_VAT = 0.5;

/** Ramène un taux à 4 décimales en entier (×10 000) sans erreur de flottant. */
export function toScaledRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) throw new RangeError('Taux invalide');
  return Math.round(rate * SCALE);
}

function parseDay(value: string): number | null {
  const match = DATE.exec(value);
  if (match === null) return null;
  const [, y, m, d] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const back = new Date(time);
  // Refuse 2026-02-31 et consorts : la date doit exister.
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(m) - 1 ||
    back.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return time;
}

/** Nombre de jours, début ET fin inclus ; `null` si une date est invalide ou si la fin précède le début. */
export function daysInclusive(start: string, end: string): number | null {
  const a = parseDay(start);
  const b = parseDay(end);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

function money(cents: number, scaledFx: number, currency: FcfaCurrency): CostMoney {
  // centimes × (FCFA par dollar × 10 000) ÷ (100 centimes × 10 000)
  const converted = applyRate(usdCents(cents), scaledFx, SCALE * 100, 'half_up');
  return { xaf: xaf(converted.amountMinor).amountMinor, usd_cents: cents, currency };
}

const EMPTY: Omit<CampaignCostView, 'status' | 'vat_country'> = {
  vat_rate: null,
  days: null,
  budget_usd_cents: null,
  vat_usd_cents: null,
  total_usd_cents: null,
  total: null,
  daily: null,
  fx: null,
};

export function campaignCost(input: CostInput): CampaignCostView {
  const { dailyBudgetUsdCents: daily, vat } = input;
  if (daily !== null && (!Number.isSafeInteger(daily) || daily <= 0)) {
    throw new RangeError('Le budget par jour doit être un entier positif de centimes');
  }
  const vatScaled = vat.rate === null ? null : toScaledRate(vat.rate);
  if (vatScaled !== null && vatScaled > MAX_VAT * SCALE) {
    throw new RangeError('La TVA doit être comprise entre 0 et 0,5');
  }
  const fxScaled = input.fx === null ? null : toScaledRate(input.fx.rate);
  if (fxScaled !== null && fxScaled <= 0)
    throw new RangeError('Le taux de change doit être positif');

  const fxView: CostFx | null =
    input.fx === null
      ? null
      : {
          base: 'USD',
          quote: input.fx.quote,
          rate: input.fx.rate,
          source: input.fx.source,
          fetched_at: input.fx.fetchedAt,
        };
  const currency: FcfaCurrency = input.fx?.quote ?? 'XAF';
  const dailyMoney = daily !== null && fxScaled !== null ? money(daily, fxScaled, currency) : null;

  // Même règle que la validation : fin > début, donc deux jours au moins (début et fin compris).
  const days =
    input.startDate === null || input.endDate === null || input.endDate <= input.startDate
      ? null
      : daysInclusive(input.startDate, input.endDate);
  if (daily === null || days === null) {
    return {
      ...EMPTY,
      status: 'incomplete',
      vat_country: vat.country,
      daily: dailyMoney,
      fx: fxView,
    };
  }

  const budget = daily * days;
  if (!Number.isSafeInteger(budget)) throw new RangeError('Budget total hors limites');
  if (vatScaled === null) {
    return {
      ...EMPTY,
      status: 'vat_not_configured',
      vat_country: vat.country,
      days,
      budget_usd_cents: budget,
      daily: dailyMoney,
      fx: fxView,
    };
  }

  const vatCents = applyRate(usdCents(budget), vatScaled, SCALE, 'half_up').amountMinor;
  const total = budget + vatCents;
  return {
    status: fxScaled === null ? 'fx_not_available' : 'ok',
    vat_country: vat.country,
    vat_rate: vat.rate,
    days,
    budget_usd_cents: budget,
    vat_usd_cents: vatCents,
    total_usd_cents: total,
    total: fxScaled === null ? null : money(total, fxScaled, currency),
    daily: dailyMoney,
    fx: fxView,
  };
}
