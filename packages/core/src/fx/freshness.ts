// Fraîcheur d'un taux de change. Un taux plus vieux que ce seuil n'est plus utilisé : l'écran affiche alors le dollar seul
// (statut `fx_not_available`), jamais un taux périmé présenté comme actuel.
//
// Seuil : 48 heures. Le fournisseur publie une fois par jour; 48 h laissent passer UNE mise à jour manquée (panne, blocage
// de 20 minutes, tâche en retard) sans afficher de taux ancien de plus de deux jours.

export const FX_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Tolérance sur une horloge qui avance : au-delà, la date est jugée fausse. */
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

export interface FxAgeFields {
  /** Heure de publication par le fournisseur (prime quand elle existe). */
  provider_updated_at: string | null;
  fetched_at: string;
}

export function isFxFresh(row: FxAgeFields, now: Date): boolean {
  const reference = Date.parse(row.provider_updated_at ?? row.fetched_at);
  if (Number.isNaN(reference)) return false;
  const age = now.getTime() - reference;
  return age <= FX_MAX_AGE_MS && age >= -FUTURE_TOLERANCE_MS;
}
