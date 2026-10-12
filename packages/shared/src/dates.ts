// Dates en UTC ; le fuseau de l'utilisateur ne sert qu'à l'affichage et aux limites
// « par jour » (CONVENTIONS §6.6). L'heure courante vient toujours de `ctx.now()`.

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function toIsoUtc(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Date invalide');
  return date.toISOString();
}

/** Lit une date ISO 8601 en UTC (suffixe `Z` obligatoire). */
export function parseIsoUtc(value: string): Date {
  if (!ISO_UTC.test(value)) throw new RangeError('Date ISO UTC attendue (suffixe Z)');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Date invalide');
  return date;
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(date: Date, days: number): Date {
  return addSeconds(date, days * 86_400);
}

export function diffSeconds(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 1000);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Date du calendrier (`YYYY-MM-DD`) de l'instant `date` dans le fuseau `timeZone`. */
export function calendarDateIn(date: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Fuseau inconnu : ${timeZone}`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
