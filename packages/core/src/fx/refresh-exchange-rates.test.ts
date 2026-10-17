// Rafraîchissement des taux de change (S15b) : la source est FAUSSE, aucun appel réseau réel. Tous les taux ci-dessous sont
// des VALEURS D'ESSAI (le calcul doit marcher pour n'importe quel taux), pas des données du produit.
import { describe, expect, it } from 'vitest';
import { MemoryDb } from '../analysis/memory-db.test-helper';
import { FakeFxRateSource, fakeSnapshot } from './fake-fx-source';
import { FxSourceError } from './fx-source';
import { refreshExchangeRates, MAX_DAILY_VARIATION, type FxLogger } from './refresh-exchange-rates';

const NOW = new Date('2026-10-17T06:00:00Z');
const PUBLISHED = new Date('2026-10-17T00:02:32Z');
const NEXT = new Date('2026-10-18T00:14:22Z');

function world(over: { countries?: [string, string, boolean?][] } = {}) {
  const db = new MemoryDb();
  db.rules.exchange_rates = { unique: [['quote', 'provider_updated_at']] };
  const countries = over.countries ?? [
    ['CM', 'XAF'],
    ['GA', 'XAF'],
    ['SN', 'XOF'],
    ['NG', 'NGN'],
    ['TN', 'TND'],
  ];
  for (const [code, currency, active] of countries) {
    db.rows('countries').push({ code, currency, active: active ?? true });
  }
  const logs: {
    level: string;
    msg: string;
    fields: { code?: unknown; currency?: unknown; endOfLifeAt?: unknown } & Record<string, unknown>;
  }[] = [];
  const logger: FxLogger = {
    info: (msg, fields = {}) => logs.push({ level: 'info', msg, fields }),
    warn: (msg, fields = {}) => logs.push({ level: 'warn', msg, fields }),
    error: (msg, fields = {}) => logs.push({ level: 'error', msg, fields }),
  };
  const run = (source: FakeFxRateSource, now = NOW) =>
    refreshExchangeRates({ svc: db.asService(), source, now: () => now, logger });
  return { db, logs, run };
}
const snapshot = (rates: Record<string, number>, over = {}) =>
  fakeSnapshot(rates, { providerUpdatedAt: PUBLISHED, nextUpdateAt: NEXT, ...over });
const stored = (db: MemoryDb) => db.rows('exchange_rates');

describe('refreshExchangeRates : première exécution', () => {
  it('écrit un taux par monnaie des pays actifs (FCFA une seule fois), avec source, publication et prochaine mise à jour', async () => {
    const { db, run } = world();
    const source = new FakeFxRateSource(
      snapshot({ XAF: 583.48353, XOF: 583.48353, NGN: 1332.43205, TND: 2.994219, GHS: 11 }),
    );
    const report = await run(source);
    expect(report.status).toBe('refreshed');
    expect(report.written.sort()).toEqual(['NGN', 'TND', 'XAF', 'XOF']);
    expect(stored(db)).toHaveLength(4);
    expect(stored(db).find((r) => r.quote === 'XAF')).toMatchObject({
      base: 'USD',
      source: 'exchangerate-api',
      fetched_at: NOW.toISOString(),
      provider_updated_at: PUBLISHED.toISOString(),
      next_update_at: NEXT.toISOString(),
    });
    // GHS est fourni par la source mais aucun pays actif ne l'utilise ici : rien n'est écrit.
    expect(stored(db).some((r) => r.quote === 'GHS' || r.quote === 'USD')).toBe(false);
  });

  it('arrondit au dix-millième, demi vers le haut, sans erreur de flottant (colonne numeric(12,4))', async () => {
    const { db, run } = world();
    await run(
      new FakeFxRateSource(
        snapshot({ XAF: 583.48353, XOF: 583.48355, NGN: 1332.43205, TND: 2.994219 }),
      ),
    );
    const rate = (q: string) => stored(db).find((r) => r.quote === q)?.rate;
    expect(rate('XAF')).toBe(583.4835);
    expect(rate('XOF')).toBe(583.4836); // 583,48355 : 0,5 monte
    expect(rate('NGN')).toBe(1332.4321);
    expect(rate('TND')).toBe(2.9942);
  });

  it('un pays désactivé ou sans monnaie prise en charge n’est pas demandé', async () => {
    const { db, run } = world({
      countries: [
        ['NG', 'NGN'],
        ['GH', 'GHS', false],
        ['XX', 'EUR'],
      ],
    });
    const report = await run(new FakeFxRateSource(snapshot({ NGN: 1500, GHS: 11, EUR: 0.9 })));
    expect(report.written).toEqual(['NGN']);
    expect(stored(db)).toHaveLength(1);
  });
});

describe('refreshExchangeRates : quand appeler le fournisseur', () => {
  it('prochaine mise à jour annoncée pas encore atteinte : la source n’est PAS appelée', async () => {
    const { db, run } = world();
    const first = new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 }));
    await run(first);
    const before = stored(db).length;
    const again = new FakeFxRateSource(snapshot({ XAF: 999 }));
    const report = await run(again, new Date('2026-10-17T18:00:00Z'));
    expect(report.status).toBe('not_due');
    expect(again.calls).toBe(0);
    expect(stored(db)).toHaveLength(before);
  });

  it('prochaine mise à jour passée et nouvelle publication : nouveaux taux, anciens conservés (historique)', async () => {
    const { db, run } = world();
    await run(new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 })));
    const later = new Date('2026-10-18T01:00:00Z');
    const next = new FakeFxRateSource(
      snapshot(
        { XAF: 610, XOF: 610, NGN: 1510, TND: 3.2 },
        {
          providerUpdatedAt: new Date('2026-10-18T00:03:00Z'),
          nextUpdateAt: new Date('2026-10-19T00:10:00Z'),
        },
      ),
    );
    const report = await run(next, later);
    expect(report.status).toBe('refreshed');
    expect(next.calls).toBe(1);
    expect(stored(db)).toHaveLength(8);
  });

  it('même publication déjà enregistrée : rien n’est écrit deux fois (idempotent)', async () => {
    const { db, run } = world();
    const source = new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 }));
    await run(source);
    const report = await run(source, new Date('2026-10-18T06:00:00Z')); // due, mais le fournisseur n'a rien republié
    expect(report.status).toBe('refreshed');
    expect(report.written).toEqual([]);
    expect(report.unchanged.sort()).toEqual(['NGN', 'TND', 'XAF', 'XOF']);
    expect(stored(db)).toHaveLength(4);
  });

  it('écriture concurrente (violation d’unicité) : traité comme déjà écrit, aucune erreur', async () => {
    const { db, run } = world();
    db.beforeInsert = (table, memory) => {
      if (table !== 'exchange_rates') return;
      memory.beforeInsert = undefined;
      memory.rows('exchange_rates').push({
        base: 'USD',
        quote: 'XAF',
        rate: 600,
        source: 'exchangerate-api',
        provider_updated_at: PUBLISHED.toISOString(),
        next_update_at: NEXT.toISOString(),
        fetched_at: NOW.toISOString(),
      });
    };
    const report = await run(
      new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 })),
    );
    expect(report.status).toBe('refreshed');
    expect(stored(db).filter((r) => r.quote === 'XAF')).toHaveLength(1);
  });
});

describe('refreshExchangeRates : la source échoue — les anciens taux restent, aucune relance', () => {
  it.each([
    'rate_limited',
    'http_error',
    'provider_error',
    'invalid_response',
    'unavailable',
  ] as const)(
    'erreur %s : statut failed, journalisée, rien d’écrit, UN seul appel',
    async (code) => {
      const { db, logs, run } = world();
      db.rows('exchange_rates').push({
        base: 'USD',
        quote: 'XAF',
        rate: 590,
        source: 'exchangerate-api',
        provider_updated_at: '2026-10-16T00:00:00.000Z',
        next_update_at: '2026-10-17T00:00:00.000Z',
        fetched_at: '2026-10-16T01:00:00.000Z',
      });
      const source = new FakeFxRateSource(new FxSourceError(code, 'Source des taux : panne'));
      const report = await run(source);
      expect(report).toMatchObject({ status: 'failed', error: code, written: [] });
      expect(source.calls).toBe(1);
      expect(stored(db)).toHaveLength(1);
      expect(stored(db)[0]?.rate).toBe(590);
      expect(logs.some((l) => l.level === 'error' && l.fields.code === code)).toBe(true);
    },
  );

  it('une erreur imprévue de la source est aussi attrapée et journalisée, jamais relancée', async () => {
    const { logs } = world();
    const source = {
      name: 'exchangerate-api' as const,
      calls: 0,
      fetchLatest(): Promise<never> {
        this.calls += 1;
        return Promise.reject(new Error('boom'));
      },
    };
    const report = await refreshExchangeRates({
      svc: world().db.asService(),
      source,
      now: () => NOW,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    expect(report).toMatchObject({ status: 'failed', error: 'unknown' });
    expect(source.calls).toBe(1);
    expect(logs).toEqual([]);
  });
});

describe('refreshExchangeRates : taux aberrants rejetés et journalisés', () => {
  it.each([
    ['zéro', 0],
    ['négatif', -600],
    ['NaN', Number.NaN],
    ['infini', Number.POSITIVE_INFINITY],
    ['arrondi à zéro (0,00001)', 0.00001],
    ['trop grand pour la colonne', 100_000_000],
  ])('%s : rejeté, les autres monnaies sont écrites', async (_name, bad) => {
    const { db, run, logs } = world();
    const report = await run(
      new FakeFxRateSource(snapshot({ XAF: bad, XOF: 600, NGN: 1500, TND: 3.1 })),
    );
    expect(report.rejected).toEqual([{ currency: 'XAF', reason: 'invalid_rate' }]);
    expect(report.written.sort()).toEqual(['NGN', 'TND', 'XOF']);
    expect(stored(db).some((r) => r.quote === 'XAF')).toBe(false);
    expect(logs.some((l) => l.level === 'error' && l.fields.currency === 'XAF')).toBe(true);
  });

  it('variation de plus de 50 % en une publication : rejeté, l’ancien taux reste', async () => {
    const { db, run, logs } = world();
    await run(new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 })));
    const next = snapshot(
      { XAF: 600, XOF: 600, NGN: 1500 * (1 + MAX_DAILY_VARIATION) + 1, TND: 3.1 },
      {
        providerUpdatedAt: new Date('2026-10-18T00:03:00Z'),
        nextUpdateAt: new Date('2026-10-19T00:10:00Z'),
      },
    );
    const report = await run(new FakeFxRateSource(next), new Date('2026-10-18T06:00:00Z'));
    expect(report.rejected).toEqual([{ currency: 'NGN', reason: 'variation_too_large' }]);
    expect(report.written.sort()).toEqual(['TND', 'XAF', 'XOF']);
    expect(stored(db).filter((r) => r.quote === 'NGN')).toHaveLength(1);
    expect(logs.some((l) => l.level === 'error' && l.fields.currency === 'NGN')).toBe(true);
  });

  it('une baisse de plus de 50 % est aussi rejetée; une variation de 50 % exactement passe', async () => {
    const { run, db } = world();
    await run(new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 })));
    const next = snapshot(
      { XAF: 300, XOF: 900, NGN: 700, TND: 3.1 },
      {
        providerUpdatedAt: new Date('2026-10-18T00:03:00Z'),
        nextUpdateAt: new Date('2026-10-19T00:10:00Z'),
      },
    );
    const report = await run(new FakeFxRateSource(next), new Date('2026-10-18T06:00:00Z'));
    // XAF 600 -> 300 : -50 % pile, accepté ; XOF 600 -> 900 : +50 % pile, accepté ; NGN 1500 -> 700 : -53 %, rejeté
    expect(report.rejected).toEqual([{ currency: 'NGN', reason: 'variation_too_large' }]);
    expect(report.written.sort()).toEqual(['TND', 'XAF', 'XOF']);
    expect(stored(db).filter((r) => r.quote === 'XAF')).toHaveLength(2);
  });

  it('monnaie absente de la réponse du fournisseur : signalée, aucun taux inventé', async () => {
    const { db, run, logs } = world();
    const report = await run(new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500 })));
    expect(report.missing).toEqual(['TND']);
    expect(stored(db).some((r) => r.quote === 'TND')).toBe(false);
    expect(logs.some((l) => l.level === 'warn' && JSON.stringify(l.fields).includes('TND'))).toBe(
      true,
    );
  });

  it('fin de service annoncée du point d’accès : avertissement journalisé', async () => {
    const { run, logs } = world();
    await run(
      new FakeFxRateSource(
        snapshot(
          { XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 },
          { endOfLifeAt: new Date('2027-01-15T08:00:00Z') },
        ),
      ),
    );
    expect(
      logs.some((l) => l.level === 'warn' && String(l.fields.endOfLifeAt).startsWith('2027-01-15')),
    ).toBe(true);
  });
});

describe('refreshExchangeRates : erreurs de base', () => {
  it('lecture des pays en échec : internal_error, la source n’est pas appelée', async () => {
    const { db, run } = world();
    db.failNext.add('countries:select');
    const source = new FakeFxRateSource(snapshot({ XAF: 600 }));
    await expect(run(source)).rejects.toMatchObject({ code: 'internal_error' });
    expect(source.calls).toBe(0);
  });

  it('écriture en échec : internal_error (la tâche le journalise), rien n’est écrit', async () => {
    const { db, run } = world();
    db.failNext.add('exchange_rates:insert');
    await expect(
      run(new FakeFxRateSource(snapshot({ XAF: 600, XOF: 600, NGN: 1500, TND: 3.1 }))),
    ).rejects.toMatchObject({ code: 'internal_error' });
    expect(stored(db)).toHaveLength(0);
  });

  it('aucun pays actif : rien à faire, la source n’est pas appelée', async () => {
    const { run } = world({ countries: [] });
    const source = new FakeFxRateSource(snapshot({ XAF: 600 }));
    const report = await run(source);
    expect(report.status).toBe('nothing_to_do');
    expect(source.calls).toBe(0);
  });
});
