// TR-PLA-06 (statistiques copiées dans notre base) et EC-META-10 (limite de débit : dernières valeurs gardées, heure affichée).
// FAUSSE Meta uniquement. Les chiffres sont des valeurs D'ESSAI.
import { MetaGraphError, type PlatformConnector } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { day, MIN, NOW, rowOf, syncWorld, W, type SyncWorld } from './sync.test-helper';
import { STATS_REFETCH_DAYS, syncCampaignStats } from './sync-stats';

const CONVERSATION = 'onsite_conversion.messaging_conversation_started_7d';

function stats(s: SyncWorld): Record<string, unknown>[] {
  return s.w.db
    .rows('stats_daily')
    .filter((r) => r.campaign_id === s.id)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

describe('TR-PLA-06 — copie des statistiques', () => {
  it('première synchronisation : une ligne par jour, en centimes de dollar, avec la date de copie', async () => {
    const s = await syncWorld();
    rowOf(s.w.db, s.id).published_at = '2026-10-10T08:00:00Z';
    s.fake.seedStats(s.refs, [
      day('2026-10-11', { spendUsdCents: 700, results: 5 }),
      day('2026-10-12', { spendUsdCents: 900, results: 9, clicks: 40, resultType: 'link_click' }),
    ]);
    const report = await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(report).toMatchObject({
      scanned: 1,
      synced: 1,
      daysWritten: 2,
      errors: 0,
      rateLimited: false,
    });
    expect(stats(s)).toEqual([
      expect.objectContaining({
        date: '2026-10-11',
        spend_usd_cents: 700,
        results: 5,
        result_type: CONVERSATION,
        ad_id: null,
      }),
      expect.objectContaining({
        date: '2026-10-12',
        spend_usd_cents: 900,
        results: 9,
        result_type: 'link_click',
        workspace_id: W,
      }),
    ]);
    const row = rowOf(s.w.db, s.id);
    expect(row.stats_synced_at).toBe(s.ctxAt(60).now().toISOString());
    expect(row.stats_sync_error).toBeNull();
  });

  it('idempotente : rejouer la copie met à jour les mêmes lignes, sans doublon (jamais deux lignes pour un jour)', async () => {
    const s = await syncWorld();
    s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 700 })]);
    await syncCampaignStats(s.ctxAt(60), s.deps());
    s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 950 })]);
    await syncCampaignStats(s.ctxAt(120), s.deps());
    await syncCampaignStats(s.ctxAt(180), s.deps());
    expect(stats(s)).toHaveLength(1);
    expect(stats(s)[0]).toMatchObject({ spend_usd_cents: 950 });
  });

  it('course : une autre copie insère le même jour entre notre lecture et notre insertion → mise à jour, pas d’erreur', async () => {
    const s = await syncWorld();
    s.w.db.rules.stats_daily = { unique: [['campaign_id', 'date']] };
    s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 800 })]);
    s.w.db.beforeInsert = (table, db) => {
      if (table !== 'stats_daily') return;
      db.beforeInsert = undefined;
      db.rows('stats_daily').push({
        workspace_id: W,
        campaign_id: s.id,
        ad_id: null,
        date: '2026-10-12',
        spend_usd_cents: 1,
        impressions: 0,
        reach: 0,
        clicks: 0,
        results: 0,
        result_type: null,
      });
    };
    const report = await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(report.errors).toBe(0);
    expect(stats(s)).toHaveLength(1);
    expect(stats(s)[0]).toMatchObject({ spend_usd_cents: 800 });
  });

  it('première copie : remonte jusqu’à la publication ; les suivantes ne relisent que les 7 derniers jours', async () => {
    const s = await syncWorld();
    const seen: { since: string; until: string }[] = [];
    const connector: PlatformConnector = new Proxy(s.fake, {
      get(target, key, receiver) {
        if (key === 'fetchStats') {
          return (t: never, r: never, range: { since: string; until: string }) => {
            seen.push(range);
            return target.fetchStats(t, r, range);
          };
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    Object.assign(rowOf(s.w.db, s.id), { published_at: '2026-09-20T10:00:00Z' });
    await syncCampaignStats(s.ctxAt(60), s.deps({ connector }));
    await syncCampaignStats(s.ctxAt(120), s.deps({ connector }));
    expect(seen[0]).toEqual({ since: '2026-09-20', until: '2026-10-12' });
    expect(seen[1]).toEqual({ since: '2026-10-05', until: '2026-10-12' });
    expect(STATS_REFETCH_DAYS).toBe(7);
  });

  it('LECTURE seule : fetchStats est le seul appel à Meta', async () => {
    const s = await syncWorld();
    const calls: string[] = [];
    const connector: PlatformConnector = new Proxy(s.fake, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          calls.push(String(key));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    await syncCampaignStats(s.ctxAt(60), s.deps({ connector }));
    expect(calls).toEqual(['fetchStats']);
  });

  it('ne copie ni les brouillons, ni les campagnes sans identifiant Meta, ni une campagne terminée depuis plus de 2 jours', async () => {
    const s = await syncWorld();
    s.fake.seedStats(s.refs, [day('2026-10-12')]);
    rowOf(s.w.db, s.id).status = 'draft';
    expect((await syncCampaignStats(s.ctxAt(60), s.deps())).scanned).toBe(0);
    Object.assign(rowOf(s.w.db, s.id), {
      status: 'ended',
      end_date: '2026-10-05',
      stats_synced_at: '2026-10-08T00:00:00Z',
    });
    expect((await syncCampaignStats(s.ctxAt(60), s.deps())).scanned).toBe(0);
    Object.assign(rowOf(s.w.db, s.id), { end_date: '2026-10-11' });
    expect((await syncCampaignStats(s.ctxAt(60), s.deps())).scanned).toBe(1);
  });
});

describe('Compte publicitaire hors dollar — jamais de taux inventé', () => {
  async function ngn(): Promise<SyncWorld> {
    const s = await syncWorld();
    Object.assign(s.w.db.rows('ad_accounts')[0] ?? {}, { currency: 'NGN' });
    s.w.db.rows('exchange_rates').push({
      base: 'USD',
      quote: 'NGN',
      rate: 1500,
      source: 'exchangerate-api',
      fetched_at: '2026-10-12T08:00:00Z',
      provider_updated_at: '2026-10-12T00:00:00Z',
    });
    return s;
  }

  it('la dépense de Meta (en naira) est convertie en centimes de dollar avec le taux frais : 15 000 NGN à 1 500 → 10 $', async () => {
    const s = await ngn();
    // Le connecteur lit « montant × 100 » : 15 000,00 NGN = 1 500 000.
    s.fake.seedStats(s.refs, [
      day('2026-10-12', { spendUsdCents: 1_500_000, cpmUsdCents: 150_000 }),
    ]);
    await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(stats(s)[0]).toMatchObject({ spend_usd_cents: 1000, cpm_usd_cents: 100 });
  });

  it('arrondi au plus proche, 100 NGN à 1 500 = 0,0667 $ → 7 centimes', async () => {
    const s = await ngn();
    s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 10_000 })]);
    await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(stats(s)[0]).toMatchObject({ spend_usd_cents: 7 });
  });

  it('taux de plus de 48 h : rien n’est écrit, les dernières valeurs restent, la raison est notée (fx_not_available)', async () => {
    const s = await ngn();
    const rate = s.w.db.rows('exchange_rates').find((r) => r.quote === 'NGN');
    if (rate !== undefined)
      Object.assign(rate, {
        fetched_at: '2026-10-09T08:00:00Z',
        provider_updated_at: '2026-10-09T00:00:00Z',
      });
    s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 1_500_000 })]);
    const report = await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(report).toMatchObject({ synced: 0, skipped: 1 });
    expect(stats(s)).toHaveLength(0);
    expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('fx_not_available');
  });

  it('aucun taux du tout : même chose, aucune valeur par défaut', async () => {
    const s = await ngn();
    s.w.db.tables.exchange_rates = (s.w.db.tables.exchange_rates ?? []).filter(
      (r) => r.quote !== 'NGN',
    );
    const report = await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(report.synced).toBe(0);
    expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('fx_not_available');
  });

  it('monnaie du compte inconnue : on ne suppose jamais le dollar', async () => {
    const s = await syncWorld();
    Object.assign(s.w.db.rows('ad_accounts')[0] ?? {}, { currency: null });
    s.fake.seedStats(s.refs, [day('2026-10-12')]);
    const report = await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(report.synced).toBe(0);
    expect(stats(s)).toHaveLength(0);
    expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('fx_not_available');
  });

  it('dollar : aucune conversion, aucun taux demandé', async () => {
    const s = await syncWorld();
    s.w.db.tables.exchange_rates = [];
    s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 1234 })]);
    await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(stats(s)[0]).toMatchObject({ spend_usd_cents: 1234 });
  });
});

describe('EC-META-10 — limite de débit : on garde les dernières valeurs et on montre leur heure', () => {
  function limited(s: SyncWorld, code: number): PlatformConnector {
    return new Proxy(s.fake, {
      get(target, key, receiver) {
        if (key === 'fetchStats') {
          return () => Promise.reject(new MetaGraphError({ code, message: 'limite' }, 400));
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  }

  it.each([4, 17, 613, 80000, 80004, 80014])(
    'code %i : aucune ligne n’est effacée, stats_synced_at n’avance PAS, stats_sync_error = rate_limited',
    async (code) => {
      const s = await syncWorld();
      s.fake.seedStats(s.refs, [day('2026-10-12', { spendUsdCents: 700 })]);
      await syncCampaignStats(s.ctxAt(60), s.deps());
      const before = rowOf(s.w.db, s.id).stats_synced_at;
      const report = await syncCampaignStats(s.ctxAt(120), s.deps({ connector: limited(s, code) }));
      expect(report).toMatchObject({ rateLimited: true, synced: 0, errors: 0 });
      expect(stats(s)).toHaveLength(1);
      expect(stats(s)[0]).toMatchObject({ spend_usd_cents: 700 });
      expect(rowOf(s.w.db, s.id).stats_synced_at).toBe(before);
      expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('rate_limited');
    },
  );

  it('la passe suivante, sans limite, reprend et efface la raison', async () => {
    const s = await syncWorld();
    s.fake.seedStats(s.refs, [day('2026-10-12')]);
    await syncCampaignStats(s.ctxAt(60), s.deps({ connector: limited(s, 80004) }));
    expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('rate_limited');
    await syncCampaignStats(s.ctxAt(120), s.deps());
    expect(rowOf(s.w.db, s.id)).toMatchObject({
      stats_sync_error: null,
      stats_synced_at: s.ctxAt(120).now().toISOString(),
    });
  });

  it('jeton expiré : aucune panne comptée côté Meta, la raison est notée (token_expired)', async () => {
    const s = await syncWorld();
    const connection = s.w.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.status = 'expired';
    await syncCampaignStats(s.ctxAt(60), s.deps());
    expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('token_expired');
  });

  it('autre erreur de Meta : comptée en erreur, raison meta_error, valeurs gardées', async () => {
    const s = await syncWorld();
    const report = await syncCampaignStats(s.ctxAt(60), s.deps({ connector: limited(s, 100) }));
    expect(report).toMatchObject({ errors: 1, rateLimited: false });
    expect(rowOf(s.w.db, s.id).stats_sync_error).toBe('meta_error');
  });
});

describe('À la demande (bouton « Actualiser »)', () => {
  it('une seule campagne, filtrée par espace : un identifiant d’un autre espace ne copie rien', async () => {
    const s = await syncWorld();
    s.fake.seedStats(s.refs, [day('2026-10-12')]);
    const other = await syncCampaignStats(s.ctxAt(60), s.deps(), {
      campaignId: s.id,
      workspaceId: '00000000-0000-4000-8000-0000000000a2',
    });
    expect(other.scanned).toBe(0);
    expect(stats(s)).toHaveLength(0);
    const own = await syncCampaignStats(s.ctxAt(60), s.deps(), {
      campaignId: s.id,
      workspaceId: W,
    });
    expect(own).toMatchObject({ scanned: 1, synced: 1 });
    expect(MIN).toBe(60_000);
    expect(NOW.getTime()).toBeGreaterThan(0);
  });
});

describe('Candidats : le tri et la limite se font DANS la base (jamais en mémoire sur un lot déjà tronqué)', () => {
  const RECENT = '2026-10-12T08:30:00.000Z';

  it('au-delà de 1 000 campagnes, la jamais copiée passe en premier même si elle est la dernière ligne', async () => {
    const s = await syncWorld();
    const original = rowOf(s.w.db, s.id);
    original.stats_synced_at = RECENT;
    for (let i = 0; i < 1005; i += 1) {
      s.w.db.rows('campaigns').push({ ...original, id: s.w.db.nextId(), stats_synced_at: RECENT });
    }
    const target = s.w.db.nextId();
    s.w.db.rows('campaigns').push({ ...original, id: target, stats_synced_at: null });
    s.fake.seedStats(s.refs, [day('2026-10-12')]);
    const report = await syncCampaignStats(s.ctxAt(60), s.deps(), { limit: 1 });
    expect(report.scanned).toBe(1);
    expect(rowOf(s.w.db, target).stats_synced_at).toBe(s.ctxAt(60).now().toISOString());
  });

  it('1 005 campagnes terminées depuis longtemps n’affament pas celles qui diffusent', async () => {
    const s = await syncWorld();
    const original = rowOf(s.w.db, s.id);
    original.status = 'active';
    original.stats_synced_at = RECENT;
    for (let i = 0; i < 1005; i += 1) {
      s.w.db.rows('campaigns').push({
        ...original,
        id: s.w.db.nextId(),
        status: 'ended',
        end_date: '2026-09-01',
        stats_synced_at: '2026-09-03T00:00:00.000Z',
      });
    }
    // La campagne qui diffuse est la DERNIÈRE ligne : un lot tronqué en mémoire ne la verrait jamais.
    const rows = s.w.db.rows('campaigns');
    rows.push(rows.splice(rows.indexOf(original), 1)[0] ?? original);
    s.fake.seedStats(s.refs, [day('2026-10-12')]);
    const report = await syncCampaignStats(s.ctxAt(60), s.deps(), { limit: 5 });
    expect(report.scanned).toBe(1);
    expect(rowOf(s.w.db, s.id).stats_synced_at).toBe(s.ctxAt(60).now().toISOString());
  });

  it('une campagne arrêtée sans date de fin n’est copiée qu’une fois, pas indéfiniment', async () => {
    const s = await syncWorld();
    Object.assign(rowOf(s.w.db, s.id), {
      status: 'stopped',
      end_date: null,
      stats_synced_at: RECENT,
    });
    expect((await syncCampaignStats(s.ctxAt(60), s.deps())).scanned).toBe(0);
    rowOf(s.w.db, s.id).stats_synced_at = null;
    expect((await syncCampaignStats(s.ctxAt(60), s.deps())).scanned).toBe(1);
  });
});
