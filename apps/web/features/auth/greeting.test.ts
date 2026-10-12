import { describe, expect, it } from 'vitest';
import { greetingKey, localHour } from './greeting';

// Même instant, 17 h 30 UTC : l'heure locale décide, selon le fuseau DÉCLARÉ (TR-PLT-04).
const instant = new Date('2026-10-12T17:30:00Z');

describe('TR-PLT-04 : salutation selon le fuseau déclaré', () => {
  it('Africa/Douala (UTC+1) : 18 h 30 → Bonsoir', () => {
    expect(localHour(instant, 'Africa/Douala')).toBe(18);
    expect(greetingKey(instant, 'Africa/Douala')).toBe('auth.home.greeting_evening');
  });

  it('Africa/Abidjan (UTC+0) : 17 h 30 → Bonjour', () => {
    expect(localHour(instant, 'Africa/Abidjan')).toBe(17);
    expect(greetingKey(instant, 'Africa/Abidjan')).toBe('auth.home.greeting_morning');
  });

  it('America/Montreal (UTC-4) : 13 h 30 → Bonjour', () => {
    expect(greetingKey(instant, 'America/Montreal')).toBe('auth.home.greeting_morning');
  });

  it('Bonsoir jusqu’à 3 h 59, Bonjour dès 4 h', () => {
    expect(greetingKey(new Date('2026-10-12T02:59:00Z'), 'Africa/Douala')).toBe(
      'auth.home.greeting_evening',
    );
    expect(greetingKey(new Date('2026-10-12T03:00:00Z'), 'Africa/Douala')).toBe(
      'auth.home.greeting_morning',
    );
  });
});
