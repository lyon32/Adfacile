// Dates de calendrier AAAA-MM-JJ (sans heure, sans fuseau) : l'ajout de jours se fait en UTC, donc sans décalage d'heure d'été.

/** Ajoute `days` jours à une date AAAA-MM-JJ valide. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) throw new RangeError('Date illisible');
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return moved.toISOString().slice(0, 10);
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (`later` − `earlier`). */
export function diffDays(later: string, earlier: string): number {
  const a = Date.parse(`${later}T00:00:00Z`);
  const b = Date.parse(`${earlier}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError('Date illisible');
  return Math.round((a - b) / 86_400_000);
}
