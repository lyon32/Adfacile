// Montants des statistiques : dollars toujours, monnaie locale quand un taux FRAIS (moins de 48 h) existe (TVA retirée : aucun
// calcul ni affichage de TVA). Sans taux frais, `local_minor` et `currency` valent `null` et l'écran affiche le dollar seul.
// Le taux n'est jamais publié : seul le montant converti sort, plus la source pour le lien d'attribution obligatoire
// (« Taux fournis par Exchange Rate API »).
import { convertUsdCents } from '@pubeka/shared';
import type { CostFxInput } from '../cost';
import { divRound } from './amounts';

export interface StatsMoney {
  usd_cents: number;
  local_minor: number | null;
  currency: string | null;
}

export interface StatsFxView {
  status: 'ok' | 'fx_not_available';
  currency: string | null;
  source: string | null;
  fetched_at: string | null;
}

export function statsMoney(usdCents: number, fx: CostFxInput | null): StatsMoney {
  return {
    usd_cents: usdCents,
    local_minor: fx === null ? null : convertUsdCents(usdCents, fx.rate, fx.quote),
    currency: fx === null ? null : fx.quote,
  };
}

/** Montant par unité (coût par résultat) : divisé APRÈS la conversion du total, un seul arrondi sur la monnaie locale. */
export function statsMoneyPerUnit(
  totalUsdCents: number,
  count: number,
  fx: CostFxInput | null,
): StatsMoney | null {
  if (count <= 0) return null;
  return {
    usd_cents: divRound(totalUsdCents, count),
    local_minor:
      fx === null ? null : divRound(convertUsdCents(totalUsdCents, fx.rate, fx.quote), count),
    currency: fx === null ? null : fx.quote,
  };
}

export function statsFxView(fx: CostFxInput | null): StatsFxView {
  return fx === null
    ? { status: 'fx_not_available', currency: null, source: null, fetched_at: null }
    : { status: 'ok', currency: fx.quote, source: fx.source, fetched_at: fx.fetchedAt };
}
