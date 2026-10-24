// Totaux d'une campagne à partir de ses lignes `stats_daily`. Fonctions pures, tout en entiers pour l'argent.
//  - Le « résultat principal » est le type d'action qui a le plus de résultats ; les autres types ne sont pas additionnés avec
//    lui (« 3 achats » + « 40 clics » ne font pas 43 résultats).
//  - La portée n'est pas additive (une personne vue deux jours est comptée deux fois) : on donne la somme des portées
//    quotidiennes et on le dit ; la fréquence qui en découle est donc une approximation basse.
//  - CTR et fréquence sont des rapports (pas des montants) : arrondis à 2 décimales par calcul entier.
import { divRound } from './amounts';

export interface StatsRow {
  date: string;
  spend_usd_cents: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  result_type: string | null;
}

export interface StatsTotals {
  spendUsdCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  resultType: string | null;
  costPerResultUsdCents: number | null;
  cpmUsdCents: number | null;
  ctr: number | null;
  frequency: number | null;
}

/** Type d'action qui totalise le plus de résultats (égalité : ordre alphabétique, pour un choix stable). */
export function mainResultType(rows: readonly StatsRow[]): string | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.result_type === null || row.results <= 0) continue;
    totals.set(row.result_type, (totals.get(row.result_type) ?? 0) + row.results);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [type, count] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

function ratio(numerator: number, denominator: number, scale: number): number | null {
  if (denominator <= 0) return null;
  // `scale` = 100 (deux décimales) : divRound(numérateur × scale × 100, dénominateur) / 100 sans flottant intermédiaire.
  return divRound(numerator * scale * 100, denominator) / 100;
}

export function summarize(rows: readonly StatsRow[]): StatsTotals {
  let spend = 0;
  let impressions = 0;
  let reach = 0;
  let clicks = 0;
  for (const row of rows) {
    spend += row.spend_usd_cents;
    impressions += row.impressions;
    reach += row.reach;
    clicks += row.clicks;
  }
  const resultType = mainResultType(rows);
  const results =
    resultType === null
      ? 0
      : rows.reduce((sum, row) => (row.result_type === resultType ? sum + row.results : sum), 0);
  return {
    spendUsdCents: spend,
    impressions,
    reach,
    clicks,
    results,
    resultType,
    costPerResultUsdCents: results > 0 ? divRound(spend, results) : null,
    cpmUsdCents: impressions > 0 ? divRound(spend * 1000, impressions) : null,
    ctr: ratio(clicks, impressions, 100),
    frequency: ratio(impressions, reach, 1),
  };
}
