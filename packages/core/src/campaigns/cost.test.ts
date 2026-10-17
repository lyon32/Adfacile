// Coût d'une campagne (PRD §9.2, TR-PAY-12, TR-PLA-10) : budget par jour × jours (début et fin compris), en entiers.
// TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision.
// ATTENTION : les taux de change écrits ici sont des VALEURS DE TEST (le calcul doit marcher pour n'importe quel taux) ;
// ce ne sont pas des données du produit. Les vrais taux viennent de `exchange_rates`.
import { describe, expect, it } from 'vitest';
import { campaignCost, daysInclusive, toScaledRate } from './cost';

const fx = (rate: number) => ({
  rate,
  quote: 'XAF' as const,
  source: 'manual' as const,
  fetchedAt: '2026-10-10T09:00:00.000Z',
});
const base = {
  dailyBudgetUsdCents: 500,
  startDate: '2026-10-11',
  endDate: '2026-10-17',
} as const;

describe('daysInclusive', () => {
  it('compte début et fin inclus', () => {
    expect(daysInclusive('2026-10-11', '2026-10-17')).toBe(7);
    expect(daysInclusive('2026-10-11', '2026-10-11')).toBe(1);
  });
  it('traverse un changement de mois, d’année et une année bissextile', () => {
    expect(daysInclusive('2026-10-30', '2026-11-02')).toBe(4);
    expect(daysInclusive('2026-12-31', '2027-01-01')).toBe(2);
    expect(daysInclusive('2028-02-28', '2028-03-01')).toBe(3);
  });
  it('refuse une fin avant le début et une date mal formée', () => {
    expect(daysInclusive('2026-10-12', '2026-10-11')).toBeNull();
    expect(daysInclusive('2026-13-01', '2026-13-02')).toBeNull();
    expect(daysInclusive('hier', '2026-10-11')).toBeNull();
  });
});

describe('toScaledRate', () => {
  it('convertit un taux à 4 décimales en entier sans erreur de flottant', () => {
    expect(toScaledRate(0.1925)).toBe(1925);
    expect(toScaledRate(602.3456)).toBe(6023456);
    expect(toScaledRate(0.07)).toBe(700);
    expect(toScaledRate(1.1)).toBe(11000);
  });
  it('refuse NaN, infini et valeur négative', () => {
    expect(() => toScaledRate(Number.NaN)).toThrow(RangeError);
    expect(() => toScaledRate(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => toScaledRate(-0.1)).toThrow(RangeError);
  });
});

describe('campaignCost', () => {
  it('7 jours à 500 centimes, taux d’essai 600 : 3 500 centimes, 21 000 FCFA, sans TVA', () => {
    const cost = campaignCost({ ...base, fx: fx(600) });
    expect(cost).toMatchObject({ status: 'ok', days: 7, budget_usd_cents: 3500 });
    expect(cost.total).toEqual({ xaf: 21000, usd_cents: 3500, currency: 'XAF' });
  });

  it('aucun champ de TVA dans la sortie', () => {
    const cost = campaignCost({ ...base, fx: fx(600) });
    expect(Object.keys(cost).sort()).toEqual(
      ['budget_usd_cents', 'daily', 'days', 'fx', 'status', 'total'].sort(),
    );
  });

  it('le budget par jour reste affichable : 500 centimes = 3 000 FCFA au taux d’essai', () => {
    const cost = campaignCost({ ...base, fx: fx(600) });
    expect(cost.daily).toEqual({ xaf: 3000, usd_cents: 500, currency: 'XAF' });
  });

  it('taux de change non entier : 602,3456 par dollar', () => {
    const cost = campaignCost({ ...base, fx: fx(602.3456) });
    // 3 500 centimes × 602,3456 / 100 = 21 082,096 → 21 082 (au plus proche)
    expect(cost.total?.xaf).toBe(21082);
  });

  it('arrondi de la conversion : 0,5 exactement monte, juste dessous descend', () => {
    const two = { startDate: '2026-10-11', endDate: '2026-10-12' } as const;
    // 2 jours × 1 centime = 2 centimes ; 2 × 25 / 100 = 0,5 → 1 ; 2 × 24,99 / 100 = 0,4998 → 0
    expect(campaignCost({ dailyBudgetUsdCents: 1, ...two, fx: fx(25) }).total?.xaf).toBe(1);
    expect(campaignCost({ dailyBudgetUsdCents: 1, ...two, fx: fx(24.99) }).total?.xaf).toBe(0);
  });

  it('un seul jour (début = fin) : incomplète, comme la validation (fin > début, deux jours au moins)', () => {
    const cost = campaignCost({
      dailyBudgetUsdCents: 100,
      startDate: '2026-10-11',
      endDate: '2026-10-11',
      fx: fx(600),
    });
    expect(cost.status).toBe('incomplete');
    expect(cost.total).toBeNull();
  });

  it('deux jours, le minimum : 2 × 100 centimes = 200 centimes = 1 200 FCFA', () => {
    const cost = campaignCost({
      dailyBudgetUsdCents: 100,
      startDate: '2026-10-11',
      endDate: '2026-10-12',
      fx: fx(600),
    });
    expect(cost).toMatchObject({ days: 2, budget_usd_cents: 200 });
    expect(cost.total?.xaf).toBe(1200);
  });

  it('365 jours à 10 000 $ par jour, taux d’essai 650 : 365 000 000 centimes = 2 372 500 000 FCFA', () => {
    const cost = campaignCost({
      dailyBudgetUsdCents: 1_000_000,
      startDate: '2026-10-11',
      endDate: '2027-10-10',
      fx: fx(650),
    });
    expect(cost.days).toBe(365);
    expect(cost.budget_usd_cents).toBe(365_000_000);
    expect(cost.total?.xaf).toBe(2_372_500_000);
    expect(Number.isSafeInteger(cost.total?.xaf)).toBe(true);
  });

  it('la monnaie suit le taux : XOF', () => {
    const cost = campaignCost({ ...base, fx: { ...fx(600), quote: 'XOF' } });
    expect(cost.total?.currency).toBe('XOF');
    expect(cost.fx?.quote).toBe('XOF');
  });

  describe('taux de change absent : aucune valeur par défaut', () => {
    it('statut fx_not_available, dollars conservés, pas de monnaie locale', () => {
      const cost = campaignCost({ ...base, fx: null });
      expect(cost.status).toBe('fx_not_available');
      expect(cost.budget_usd_cents).toBe(3500);
      expect(cost.days).toBe(7);
      expect(cost.total).toBeNull();
      expect(cost.daily).toBeNull();
      expect(cost.fx).toBeNull();
    });
  });

  describe('brouillon incomplet', () => {
    it.each([
      [
        'sans budget',
        { dailyBudgetUsdCents: null, startDate: '2026-10-11', endDate: '2026-10-17' },
      ],
      ['sans date de début', { dailyBudgetUsdCents: 500, startDate: null, endDate: '2026-10-17' }],
      ['sans date de fin', { dailyBudgetUsdCents: 500, startDate: '2026-10-11', endDate: null }],
      [
        'fin avant début',
        { dailyBudgetUsdCents: 500, startDate: '2026-10-17', endDate: '2026-10-11' },
      ],
    ])('%s : incomplete, rien n’est calculé', (_name, input) => {
      const cost = campaignCost({ ...input, fx: fx(600) });
      expect(cost.status).toBe('incomplete');
      expect(cost.total).toBeNull();
      expect(cost.budget_usd_cents).toBeNull();
    });
  });

  describe('entrées invalides', () => {
    it('un budget qui n’est pas un entier lève une erreur', () => {
      expect(() => campaignCost({ ...base, dailyBudgetUsdCents: 500.5, fx: fx(600) })).toThrow(
        RangeError,
      );
    });
    it('un budget négatif ou nul lève une erreur', () => {
      expect(() => campaignCost({ ...base, dailyBudgetUsdCents: -1, fx: fx(600) })).toThrow(
        RangeError,
      );
      expect(() => campaignCost({ ...base, dailyBudgetUsdCents: 0, fx: fx(600) })).toThrow(
        RangeError,
      );
    });
    it('un taux de change nul ou négatif lève une erreur', () => {
      expect(() => campaignCost({ ...base, fx: fx(0) })).toThrow(RangeError);
      expect(() => campaignCost({ ...base, fx: fx(-600) })).toThrow(RangeError);
    });
  });
});
