// Calculs d'argent et de totaux des statistiques (CONVENTIONS §6.6 : entiers, arrondi explicite, jamais de flottant dans un montant).
import { describe, expect, it } from 'vitest';
import { accountCentsToUsdCents, divRound } from './amounts';
import { resultKindOf } from './result-kind';
import { mainResultType, summarize, type StatsRow } from './stats-math';
import { statsFxView, statsMoney, statsMoneyPerUnit } from './stats-money';

const CONV = 'onsite_conversion.messaging_conversation_started_7d';
const row = (over: Partial<StatsRow> = {}): StatsRow => ({
  date: '2026-10-12',
  spend_usd_cents: 500,
  impressions: 1000,
  reach: 800,
  clicks: 30,
  results: 6,
  result_type: CONV,
  ...over,
});

describe('divRound — division entière arrondie au plus proche (0,5 monte)', () => {
  it.each([
    [10, 4, 3],
    [9, 4, 2],
    [1, 2, 1],
    [0, 5, 0],
    [7, 7, 1],
    [5, 10, 1],
    [4, 10, 0],
    [14999, 10000, 1],
    [15000, 10000, 2],
  ])('%i ÷ %i = %i', (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected);
  });
  it('refuse un dénominateur nul, un négatif et un flottant', () => {
    expect(() => divRound(1, 0)).toThrow(RangeError);
    expect(() => divRound(-1, 2)).toThrow(RangeError);
    expect(() => divRound(1.5, 2)).toThrow(RangeError);
  });
  it('grands montants : pas de perte de précision (BigInt)', () => {
    expect(divRound(9_007_199_254_740_990, 1)).toBe(9_007_199_254_740_990);
  });
});

describe('accountCentsToUsdCents — dépense de Meta (monnaie du compte) → centimes de dollar', () => {
  it('dollar : inchangé', () => {
    expect(accountCentsToUsdCents(1234, null)).toBe(1234);
  });
  it('naira à 1 500 : 15 000,00 NGN → 1 000 centimes', () => {
    expect(accountCentsToUsdCents(1_500_000, 1500)).toBe(1000);
  });
  it('rand à 18,4567 (taux au dix-millième) : 100,00 ZAR → 542 centimes', () => {
    expect(accountCentsToUsdCents(10_000, 18.4567)).toBe(542);
  });
  it('refuse un taux nul ou négatif', () => {
    expect(() => accountCentsToUsdCents(100, 0)).toThrow();
    expect(() => accountCentsToUsdCents(100, -3)).toThrow();
  });
});

describe('résultat principal', () => {
  it('le type qui totalise le plus de résultats ; les autres types ne sont pas additionnés', () => {
    const rows = [
      row({ results: 3 }),
      row({ date: '2026-10-13', results: 40, result_type: 'link_click' }),
      row({ date: '2026-10-14', results: 5 }),
    ];
    expect(mainResultType(rows)).toBe('link_click');
    expect(summarize(rows).results).toBe(40);
  });
  it('égalité : ordre alphabétique (choix stable)', () => {
    expect(
      mainResultType([
        row({ results: 2, result_type: 'lead' }),
        row({ results: 2, result_type: 'link_click' }),
      ]),
    ).toBe('lead');
  });
  it('aucun résultat : null, zéro résultat et pas de coût par résultat', () => {
    const totals = summarize([row({ results: 0, result_type: null })]);
    expect(totals).toMatchObject({ results: 0, resultType: null, costPerResultUsdCents: null });
  });
  it('aucune ligne : tout est vide, sans division par zéro', () => {
    expect(summarize([])).toEqual({
      spendUsdCents: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      results: 0,
      resultType: null,
      costPerResultUsdCents: null,
      cpmUsdCents: null,
      ctr: null,
      frequency: null,
    });
  });
});

describe('totaux', () => {
  const totals = summarize([
    row(),
    row({
      date: '2026-10-13',
      spend_usd_cents: 250,
      impressions: 500,
      reach: 400,
      clicks: 10,
      results: 2,
    }),
  ]);
  it('sommes', () => {
    expect(totals).toMatchObject({
      spendUsdCents: 750,
      impressions: 1500,
      reach: 1200,
      clicks: 40,
      results: 8,
    });
  });
  it('coût par résultat : 750 ÷ 8 = 94 centimes (93,75 arrondi)', () => {
    expect(totals.costPerResultUsdCents).toBe(94);
  });
  it('CPM : 750 × 1 000 ÷ 1 500 = 500 centimes', () => {
    expect(totals.cpmUsdCents).toBe(500);
  });
  it('CTR en % à 2 décimales : 40 ÷ 1 500 = 2,67', () => {
    expect(totals.ctr).toBe(2.67);
  });
  it('fréquence : 1 500 ÷ 1 200 = 1,25', () => {
    expect(totals.frequency).toBe(1.25);
  });
});

describe('résultat en mots (F7)', () => {
  it.each([
    [CONV, 'WHATSAPP', 'whatsapp_conversation'],
    [CONV, 'MESSENGER', 'messenger_conversation'],
    [CONV, 'INSTAGRAM_DIRECT', 'instagram_conversation'],
    [CONV, 'WEBSITE', 'conversation'],
    [CONV, null, 'conversation'],
    ['purchase', 'WEBSITE', 'purchase'],
    ['omni_purchase', null, 'purchase'],
    ['lead', null, 'lead'],
    ['link_click', null, 'link_click'],
    ['post_engagement', 'ON_POST', 'post_engagement'],
    ['quelque_chose_dinconnu', 'WHATSAPP', null],
    [null, 'WHATSAPP', null],
  ])('%s + %s → %s', (type, destination, kind) => {
    expect(resultKindOf(type, destination)).toBe(kind);
  });
});

describe('montants affichés — TVA retirée, monnaie locale seulement avec un taux frais', () => {
  const fx = {
    rate: 600,
    quote: 'XAF',
    source: 'exchangerate-api',
    fetchedAt: '2026-10-12T08:00:00.000Z',
  } as const;
  it('avec taux : monnaie locale entière (FCFA sans décimale) et dollars', () => {
    expect(statsMoney(750, fx)).toEqual({ usd_cents: 750, local_minor: 4500, currency: 'XAF' });
  });
  it('sans taux : le dollar seul, aucune monnaie locale inventée', () => {
    expect(statsMoney(750, null)).toEqual({ usd_cents: 750, local_minor: null, currency: null });
  });
  it('exemple du produit : 42 messages pour 150 $ → 357 FCFA par client potentiel (taux d’essai 100)', () => {
    // 150 $ = 15 000 centimes ; taux d'essai 100 → 15 000 FCFA ; ÷ 42 = 357,14 → 357.
    const test = {
      rate: 100,
      quote: 'XAF',
      source: 'manual',
      fetchedAt: '2026-10-12T08:00:00.000Z',
    } as const;
    expect(statsMoneyPerUnit(15_000, 42, test)).toEqual({
      usd_cents: 357,
      local_minor: 357,
      currency: 'XAF',
    });
  });
  it('zéro résultat : pas de coût par résultat', () => {
    expect(statsMoneyPerUnit(500, 0, fx)).toBeNull();
  });
  it('le taux lui-même ne sort jamais (licence : pas de redistribution) — seulement la source et la date pour l’attribution', () => {
    expect(statsFxView(fx)).toEqual({
      status: 'ok',
      currency: 'XAF',
      source: 'exchangerate-api',
      fetched_at: fx.fetchedAt,
    });
    expect(JSON.stringify(statsFxView(fx))).not.toContain('600');
    expect(statsFxView(null)).toEqual({
      status: 'fx_not_available',
      currency: null,
      source: null,
      fetched_at: null,
    });
  });
});
