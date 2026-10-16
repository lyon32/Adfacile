// Coût d'une campagne (PRD §9.2-9.3, TR-PAY-12, TR-PLA-10) : budget × jours + TVA du pays, en entiers.
// ATTENTION : les taux de TVA et de change écrits ici sont des VALEURS DE TEST (le calcul doit marcher pour n'importe
// quel taux) ; ce ne sont pas des données du produit. Les vrais taux viennent de `vat_rates` et `exchange_rates`.
import { describe, expect, it } from 'vitest';
import { campaignCost, daysInclusive, toScaledRate } from './cost';

const fx = (rate: number) => ({
  rate,
  quote: 'XAF' as const,
  source: 'manual' as const,
  fetchedAt: '2026-10-10T09:00:00.000Z',
});
const vat = (rate: number | null, country: string | null = 'ZZ') => ({ country, rate });
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
  it('7 jours à 500 centimes, TVA d’essai 19,25 %, 600 FCFA par dollar', () => {
    const cost = campaignCost({ ...base, vat: vat(0.1925), fx: fx(600) });
    expect(cost).toMatchObject({
      status: 'ok',
      days: 7,
      budget_usd_cents: 3500,
      vat_usd_cents: 674, // 3500 × 0,1925 = 673,75 → arrondi au centime le plus proche
      total_usd_cents: 4174,
      vat_rate: 0.1925,
      vat_country: 'ZZ',
    });
    expect(cost.total).toEqual({ xaf: 25044, usd_cents: 4174, currency: 'XAF' });
  });

  it('le budget par jour est converti sans TVA ; il reste affichable', () => {
    const cost = campaignCost({ ...base, vat: vat(0.1925), fx: fx(600) });
    expect(cost.daily).toEqual({ xaf: 3000, usd_cents: 500, currency: 'XAF' });
  });

  it('TVA nulle : aucune TVA ajoutée', () => {
    const cost = campaignCost({ ...base, vat: vat(0), fx: fx(600) });
    expect(cost).toMatchObject({ status: 'ok', vat_usd_cents: 0, total_usd_cents: 3500 });
  });

  it('arrondi de la TVA : 0,5 centime exactement monte (demi vers le haut)', () => {
    // 100 centimes × 2 jours × 0,0025 = 0,5 centime
    const cost = campaignCost({
      dailyBudgetUsdCents: 100,
      startDate: '2026-10-11',
      endDate: '2026-10-12',
      vat: vat(0.0025),
      fx: fx(600),
    });
    expect(cost.vat_usd_cents).toBe(1);
  });

  it('arrondi de la TVA : juste sous 0,5 centime descend', () => {
    // 66 centimes × 3 jours × 0,0025 = 0,495
    const cost = campaignCost({
      dailyBudgetUsdCents: 66,
      startDate: '2026-10-11',
      endDate: '2026-10-13',
      vat: vat(0.0025),
      fx: fx(600),
    });
    expect(cost.vat_usd_cents).toBe(0);
  });

  it('taux de change non entier : 602,3456 FCFA par dollar', () => {
    const cost = campaignCost({ ...base, vat: vat(0.1925), fx: fx(602.3456) });
    // 4174 centimes × 602,3456 / 100 = 25 141,905… → 25 142 (FCFA le plus proche)
    expect(cost.total?.xaf).toBe(25142);
  });

  it('un seul jour (début = fin) : incomplète, comme la validation (fin > début, deux jours au moins)', () => {
    const cost = campaignCost({
      dailyBudgetUsdCents: 100,
      startDate: '2026-10-11',
      endDate: '2026-10-11',
      vat: vat(0.1),
      fx: fx(600),
    });
    expect(cost.status).toBe('incomplete');
    expect(cost.total).toBeNull();
  });

  it('deux jours, le minimum : 2 × 100 centimes + 10 % de TVA', () => {
    const cost = campaignCost({
      dailyBudgetUsdCents: 100,
      startDate: '2026-10-11',
      endDate: '2026-10-12',
      vat: vat(0.1),
      fx: fx(600),
    });
    expect(cost).toMatchObject({
      days: 2,
      budget_usd_cents: 200,
      vat_usd_cents: 20,
      total_usd_cents: 220,
    });
    expect(cost.total?.xaf).toBe(1320);
  });

  it('plus grand cas permis (10 000 $ par jour pendant 365 jours) reste exact', () => {
    const cost = campaignCost({
      dailyBudgetUsdCents: 1_000_000,
      startDate: '2026-10-11',
      endDate: '2027-10-10',
      vat: vat(0.5),
      fx: fx(650),
    });
    expect(cost.days).toBe(365);
    expect(cost.budget_usd_cents).toBe(365_000_000);
    expect(cost.total_usd_cents).toBe(547_500_000);
    expect(cost.total?.xaf).toBe(3_558_750_000);
    expect(Number.isSafeInteger(cost.total?.xaf)).toBe(true);
  });

  it('la monnaie suit le taux : XOF', () => {
    const cost = campaignCost({
      ...base,
      vat: vat(0),
      fx: { ...fx(600), quote: 'XOF' },
    });
    expect(cost.total?.currency).toBe('XOF');
    expect(cost.fx?.quote).toBe('XOF');
  });

  describe('TVA du pays non configurée : aucun taux inventé', () => {
    it('statut vat_not_configured, totaux vides, budget hors TVA conservé', () => {
      const cost = campaignCost({ ...base, vat: vat(null, 'CM'), fx: fx(600) });
      expect(cost.status).toBe('vat_not_configured');
      expect(cost.vat_country).toBe('CM');
      expect(cost.vat_rate).toBeNull();
      expect(cost.vat_usd_cents).toBeNull();
      expect(cost.total_usd_cents).toBeNull();
      expect(cost.total).toBeNull();
      expect(cost.budget_usd_cents).toBe(3500);
      expect(cost.days).toBe(7);
    });
    it('pays inconnu : même statut, country null', () => {
      const cost = campaignCost({ ...base, vat: vat(null, null), fx: fx(600) });
      expect(cost).toMatchObject({ status: 'vat_not_configured', vat_country: null });
    });
  });

  describe('taux de change absent : aucune valeur par défaut', () => {
    it('statut fx_not_available, totaux en dollars conservés, pas de FCFA', () => {
      const cost = campaignCost({ ...base, vat: vat(0.1925), fx: null });
      expect(cost.status).toBe('fx_not_available');
      expect(cost.total_usd_cents).toBe(4174);
      expect(cost.total).toBeNull();
      expect(cost.daily).toBeNull();
      expect(cost.fx).toBeNull();
    });
    it('TVA et taux absents : la TVA est signalée en premier', () => {
      const cost = campaignCost({ ...base, vat: vat(null), fx: null });
      expect(cost.status).toBe('vat_not_configured');
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
      const cost = campaignCost({ ...input, vat: vat(0.1925), fx: fx(600) });
      expect(cost.status).toBe('incomplete');
      expect(cost.total).toBeNull();
      expect(cost.total_usd_cents).toBeNull();
    });
  });

  describe('entrées invalides', () => {
    it('un budget qui n’est pas un entier lève une erreur', () => {
      expect(() =>
        campaignCost({ ...base, dailyBudgetUsdCents: 500.5, vat: vat(0), fx: fx(600) }),
      ).toThrow(RangeError);
    });
    it('un budget négatif ou nul lève une erreur', () => {
      expect(() =>
        campaignCost({ ...base, dailyBudgetUsdCents: -1, vat: vat(0), fx: fx(600) }),
      ).toThrow(RangeError);
      expect(() =>
        campaignCost({ ...base, dailyBudgetUsdCents: 0, vat: vat(0), fx: fx(600) }),
      ).toThrow(RangeError);
    });
    it('une TVA hors de 0 à 0,5 lève une erreur (comme la contrainte SQL)', () => {
      expect(() => campaignCost({ ...base, vat: vat(0.51), fx: fx(600) })).toThrow(RangeError);
      expect(() => campaignCost({ ...base, vat: vat(-0.01), fx: fx(600) })).toThrow(RangeError);
    });
    it('un taux de change nul ou négatif lève une erreur', () => {
      expect(() => campaignCost({ ...base, vat: vat(0), fx: fx(0) })).toThrow(RangeError);
      expect(() => campaignCost({ ...base, vat: vat(0), fx: fx(-600) })).toThrow(RangeError);
    });
  });
});
