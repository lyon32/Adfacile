// Fausse source des taux pour les tests et la CI : aucun appel réseau. Les taux qu'on lui donne sont des valeurs d'ESSAI.
import { FxSourceError, type FxRateSource, type FxSnapshot } from './fx-source';

export type FakeFxStep = FxSnapshot | FxSourceError;

/** Fabrique un relevé d'essai : `rates` est un objet code -> taux (USD = 1 est ajouté). */
export function fakeSnapshot(
  rates: Record<string, number>,
  over: Partial<Omit<FxSnapshot, 'rates'>> = {},
): FxSnapshot {
  return {
    base: 'USD',
    rates: new Map<string, number>([['USD', 1], ...Object.entries(rates)]),
    providerUpdatedAt: new Date('2026-10-17T00:02:32Z'),
    nextUpdateAt: new Date('2026-10-18T00:14:22Z'),
    endOfLifeAt: null,
    ...over,
  };
}

export class FakeFxRateSource implements FxRateSource {
  readonly name = 'exchangerate-api' as const;
  calls = 0;
  private readonly steps: FakeFxStep[];

  /** Chaque appel consomme une étape; la dernière se répète. */
  constructor(...steps: FakeFxStep[]) {
    this.steps = steps;
  }

  fetchLatest(): Promise<FxSnapshot> {
    const index = Math.min(this.calls, this.steps.length - 1);
    this.calls += 1;
    const step = this.steps[index];
    if (step === undefined) return Promise.reject(new FxSourceError('unavailable', 'Aucune étape'));
    return step instanceof FxSourceError ? Promise.reject(step) : Promise.resolve(step);
  }
}
