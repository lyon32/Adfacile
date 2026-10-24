// Fuseau d'affichage des heures : celui de l'appareil. Ces écrans ne se rendent côté serveur qu'à l'état « chargement » (les données
// arrivent du navigateur), donc aucune différence entre serveur et navigateur à l'hydratation.
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
