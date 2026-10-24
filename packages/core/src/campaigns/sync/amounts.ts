// Calculs d'argent de la synchronisation : tout en ENTIERS (CONVENTIONS §6.6). Aucun flottant n'entre dans un montant.
import { toScaledRate } from '../cost';

/** Division entière arrondie au plus proche (0,5 monte). `n` ≥ 0 et `d` > 0, sinon erreur de programmation. */
export function divRound(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError('Numérateur : entier positif ou nul attendu');
  if (!Number.isSafeInteger(d) || d <= 0)
    throw new RangeError('Dénominateur : entier positif attendu');
  const big = BigInt(n);
  const div = BigInt(d);
  const result = (2n * big + div) / (2n * div);
  const out = Number(result);
  if (!Number.isSafeInteger(out)) throw new RangeError('Résultat hors limites');
  return out;
}

/**
 * Meta donne les dépenses dans la monnaie du COMPTE publicitaire. Le connecteur les lit « montant × 100 » quelle que soit la
 * monnaie (centièmes de l'unité principale) : pour un compte hors dollar on divise par le taux (unités par dollar, entier au
 * dix-millième) pour obtenir des centimes de dollar. Dollar : inchangé.
 */
export function accountCentsToUsdCents(cents: number, perUsd: number | null): number {
  if (perUsd === null) return cents;
  const scaled = toScaledRate(perUsd);
  if (scaled <= 0) throw new RangeError('Le taux doit être positif');
  return divRound(cents * 10_000, scaled);
}
