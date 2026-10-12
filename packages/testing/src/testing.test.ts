import { describe, expect, it } from 'vitest';
import { buildPlan, buildProfile, buildWorkspace } from './builders';
import { at, durationMs, fixedClock } from './clock';
import { idSequence, seededUuid } from './ids';
import { na } from './routes';

describe('fixedClock', () => {
  it('avance et se règle sans lire l’heure réelle', () => {
    const clock = fixedClock('2026-10-10T09:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-10-10T09:00:00.000Z');
    expect(clock.advance({ days: 3, hours: 1, minutes: 2, seconds: 3 }).toISOString()).toBe(
      '2026-10-13T10:02:03.000Z',
    );
    expect(clock.set('2026-10-31T00:00:00Z').toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(fixedClock().now().toISOString()).toBe('2026-10-10T09:00:00.000Z');
    expect(() => fixedClock('pas une date')).toThrow();
    expect(durationMs({})).toBe(0);
    expect(at('2026-10-31').toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(at('2026-10-31T10:00:00Z').toISOString()).toBe('2026-10-31T10:00:00.000Z');
  });
});

describe('identifiants déterministes', () => {
  it('même graine, même UUID v4 valide', () => {
    expect(seededUuid('a')).toBe(seededUuid('a'));
    expect(seededUuid('a', 1)).not.toBe(seededUuid('a'));
    expect(seededUuid('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const next = idSequence('c');
    expect([next(), next()]).toEqual([seededUuid('c', 0), seededUuid('c', 1)]);
  });
});

describe('constructeurs', () => {
  it('objets complets, surchargés par le test', () => {
    expect(buildProfile({ ui_language: 'en' })).toMatchObject({
      ui_language: 'en',
      timezone: 'Africa/Douala',
    });
    expect(buildPlan().price_xaf).toBe(5000);
    expect(buildWorkspace({ status: 'read_only' }).status).toBe('read_only');
  });
});

describe('na()', () => {
  it('exige une raison', () => {
    expect(na('route publique').reason).toBe('route publique');
    expect(() => na('')).toThrow();
  });
});
