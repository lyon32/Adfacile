// Coût d'une campagne : budget par jour × nombre de jours (début et fin compris), en monnaie locale et en dollars
// (PRD §9.2, TR-PAY-12).
//
// TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision : la table `vat_rates` et la colonne
// `ad_accounts.vat_country` restent en base, dormantes.
//
// Règles (CONVENTIONS §6.6, SECURITY_NOTES §3.2) :
//  - tout est en ENTIERS : centimes de dollar, monnaie locale. Le taux de change arrive de la base à 4 décimales et est
//    ramené en entier (×10 000) avant tout calcul ; aucun flottant n'entre dans un montant ;
//  - arrondi explicite : conversion à l'unité la plus proche (0,5 monte, LLD §6.9) ;
//  - AUCUN taux de change par défaut : une donnée absente donne un statut explicite et des totaux vides, jamais une
//    valeur plausible.
import { convertUsdCents, minorUnits } from '@pubeka/shared';

export type CostStatus = 'ok' | 'incomplete' | 'fx_not_available';
/** Code ISO 4217 d'une monnaie prise en charge (voir `minorUnits` dans @pubeka/shared). */
export type CurrencyCode = string;

export interface CostMoney {
  /** Montant en unités mineures de `currency` (ISO 4217 : 0 décimale pour le FCFA, 2 pour le naira, 3 pour le dinar…). */
  local_minor: number;
  usd_cents: number;
  currency: CurrencyCode;
}

export type CostFxSource = 'saspay' | 'fallback' | 'manual' | 'exchangerate-api';

export interface CostFx {
  base: 'USD';
  quote: CurrencyCode;
  rate: number;
  source: CostFxSource;
  fetched_at: string;
}

/**
 * Marge indicative à prévoir en plus du budget sur la carte ou les fonds Meta, en pourcents.
 *
 * DÉCISION DE LA PERSONNE du 18/10/2026 : Meta ajoute des taxes et des frais variables (selon les clics, les conversions et le pays),
 * donc le client ne doit JAMAIS mettre exactement son budget : pour une campagne de 10 $, mettre AU MOINS 12 $ (12 à 13 $ selon ses
 * moyens). Valeur INDICATIVE, réglable plus tard par l'administration (S31) : ce n'est PAS un pourcentage de frais de Meta, que
 * Pubeka ne connaît pas et ne promet jamais.
 */
export const META_FEES_MARGIN_PERCENT = 20;

/** Montant à prévoir sur la carte ou les fonds Meta. `local` : même montant dans la monnaie du client (`null` sans taux valide). */
export interface CostReserve {
  margin_percent: number;
  usd_cents: number;
  local: CostMoney | null;
}

/**
 * Budget total + marge, arrondi au DOLLAR SUPÉRIEUR (centimes, entiers, aucun flottant) : 1 000 centimes (10 $) → 1 200 (12 $).
 * Le calcul est fait en deux arrondis au-dessus : d'abord au centime, puis au dollar.
 */
export function reserveUsdCents(
  budgetUsdCents: number,
  marginPercent: number = META_FEES_MARGIN_PERCENT,
): number {
  if (!Number.isSafeInteger(budgetUsdCents) || budgetUsdCents <= 0) {
    throw new RangeError('Le budget doit être un entier positif de centimes');
  }
  if (!Number.isSafeInteger(marginPercent) || marginPercent < 0) {
    throw new RangeError('La marge doit être un entier de pourcents, positif ou nul');
  }
  const withMargin = Math.ceil((budgetUsdCents * (100 + marginPercent)) / 100);
  return Math.ceil(withMargin / 100) * 100;
}

/** Forme de `CampaignCost` d'openapi.yaml. */
export interface CampaignCostView {
  status: CostStatus;
  days: number | null;
  /** Coût total (budget par jour × jours), en centimes de dollar : sans TVA, c'est le coût. */
  budget_usd_cents: number | null;
  total: CostMoney | null;
  daily: CostMoney | null;
  fx: CostFx | null;
  /** À prévoir sur la carte ou les fonds Meta : budget + marge, INDICATIF. `null` sans budget ou sans dates. */
  reserve: CostReserve | null;
}

export interface CostFxInput {
  /** Unités de monnaie locale pour 1 dollar. */
  rate: number;
  quote: CurrencyCode;
  source: CostFxSource;
  fetchedAt: string;
}

export interface CostInput {
  dailyBudgetUsdCents: number | null;
  /** AAAA-MM-JJ */
  startDate: string | null;
  endDate: string | null;
  fx: CostFxInput | null;
}

const SCALE = 10_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

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

function money(cents: number, rate: number, currency: CurrencyCode): CostMoney {
  return { local_minor: convertUsdCents(cents, rate, currency), usd_cents: cents, currency };
}

const EMPTY: Omit<CampaignCostView, 'status'> = {
  days: null,
  budget_usd_cents: null,
  total: null,
  daily: null,
  fx: null,
  reserve: null,
};

export function campaignCost(input: CostInput): CampaignCostView {
  const { dailyBudgetUsdCents: daily } = input;
  if (daily !== null && (!Number.isSafeInteger(daily) || daily <= 0)) {
    throw new RangeError('Le budget par jour doit être un entier positif de centimes');
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
  // Une monnaie hors de la table des unités mineures lève une erreur (jamais « 2 décimales » par défaut).
  if (input.fx !== null) minorUnits(input.fx.quote);
  const dailyMoney =
    daily !== null && input.fx !== null ? money(daily, input.fx.rate, input.fx.quote) : null;

  // Même règle que la validation : fin > début, donc deux jours au moins (début et fin compris).
  const days =
    input.startDate === null || input.endDate === null || input.endDate <= input.startDate
      ? null
      : daysInclusive(input.startDate, input.endDate);
  if (daily === null || days === null) {
    return { ...EMPTY, status: 'incomplete', daily: dailyMoney, fx: fxView };
  }

  const budget = daily * days;
  if (!Number.isSafeInteger(budget)) throw new RangeError('Budget total hors limites');
  return {
    status: fxScaled === null ? 'fx_not_available' : 'ok',
    days,
    budget_usd_cents: budget,
    total: input.fx === null ? null : money(budget, input.fx.rate, input.fx.quote),
    daily: dailyMoney,
    fx: fxView,
    reserve: reserveOf(budget, input.fx),
  };
}

function reserveOf(budget: number, fx: CostFxInput | null): CostReserve {
  const usd = reserveUsdCents(budget);
  return {
    margin_percent: META_FEES_MARGIN_PERCENT,
    usd_cents: usd,
    local: fx === null ? null : money(usd, fx.rate, fx.quote),
  };
}
