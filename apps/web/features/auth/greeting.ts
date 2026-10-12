// Salutation selon l'heure locale du fuseau déclaré (TR-PLT-04, EC-TIME-01) : jamais l'heure
// de l'appareil. « Bonsoir » de 18 h à 3 h 59, « Bonjour » de 4 h à 17 h 59 (usage courant en
// Afrique francophone).
import type { MessageKey } from './messages';

export const EVENING_STARTS_AT_HOUR = 18;
export const MORNING_STARTS_AT_HOUR = 4;

/** Heure (0-23) de `date` dans le fuseau IANA `timeZone`. */
export function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date)
    .find((p) => p.type === 'hour')?.value;
  return Number(hour);
}

export function greetingKey(date: Date, timeZone: string): MessageKey {
  const hour = localHour(date, timeZone);
  return hour >= MORNING_STARTS_AT_HOUR && hour < EVENING_STARTS_AT_HOUR
    ? 'auth.home.greeting_morning'
    : 'auth.home.greeting_evening';
}
