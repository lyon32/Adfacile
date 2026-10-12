// Horloge fixée pour les tests (TESTING §5.4) : `ctx.now` ne lit jamais l'heure réelle.

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export interface FixedClock {
  now: () => Date;
  advance: (d: Duration) => Date;
  set: (iso: string) => Date;
}

export function durationMs(d: Duration): number {
  return (
    (d.days ?? 0) * 86_400_000 +
    (d.hours ?? 0) * 3_600_000 +
    (d.minutes ?? 0) * 60_000 +
    (d.seconds ?? 0) * 1000
  );
}

export function fixedClock(iso = '2026-10-10T09:00:00Z'): FixedClock {
  let current = new Date(iso);
  if (Number.isNaN(current.getTime())) throw new Error(`Date invalide : ${iso}`);
  return {
    now: () => new Date(current),
    advance: (d) => {
      current = new Date(current.getTime() + durationMs(d));
      return new Date(current);
    },
    set: (next) => {
      current = new Date(next);
      return new Date(current);
    },
  };
}

/** Raccourci lisible : `at('2026-10-31')`. */
export function at(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}
