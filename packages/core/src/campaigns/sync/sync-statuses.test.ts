// TR-PLA-05 (statuts synchronisés : webhooks + vérification planifiée), EC-META-08 (Meta fait foi), EC-META-10 (limite de débit).
// FAUSSE Meta uniquement : aucun appel réel. La synchronisation est en LECTURE seule chez Meta : le compteur d'écritures reste à 0.
import { MetaGraphError, type PlatformConnector } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { W, MIN, rowOf, syncWorld, type SyncWorld } from './sync.test-helper';
import { syncCampaignStatuses } from './sync-statuses';

function fakeStatus(
  s: SyncWorld,
  status: 'active' | 'paused' | 'rejected' | 'in_review' | 'stopped',
): void {
  const campaign = s.fake.campaigns.get(s.refs.campaignId);
  if (campaign === undefined) throw new Error('campagne absente de la fausse Meta');
  campaign.status = status;
}

function events(s: SyncWorld, source?: string): Record<string, unknown>[] {
  return s.w.db
    .rows('campaign_status_events')
    .filter((e) => e.campaign_id === s.id && (source === undefined || e.source === source));
}

/** La fausse Meta, avec le compte des appels : seule la LECTURE du statut est permise. */
function counting(s: SyncWorld): { connector: PlatformConnector; calls: string[] } {
  const calls: string[] = [];
  const connector = new Proxy(s.fake, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(key));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { connector, calls };
}

describe('TR-PLA-05 — synchronisation des statuts', () => {
  it('Meta valide la pub : in_review → active, avec une ligne d’historique « poll » et la date de synchronisation', async () => {
    const s = await syncWorld();
    expect(rowOf(s.w.db, s.id).status).toBe('in_review');
    s.fake.simulateApproval(s.refs);
    const report = await syncCampaignStatuses(s.ctxAt(20), s.deps());
    expect(report).toMatchObject({ scanned: 1, changed: 1, errors: 0, rateLimited: false });
    const row = rowOf(s.w.db, s.id);
    expect(row.status).toBe('active');
    expect(row.status_synced_at).toBe(s.ctxAt(20).now().toISOString());
    expect(events(s, 'poll')).toMatchObject([
      {
        status: 'active',
        payload: { event: 'approve', from: 'in_review', raw_status: 'ACTIVE' },
      },
    ]);
  });

  it('Meta refuse la pub : in_review → rejected', async () => {
    const s = await syncWorld();
    s.fake.simulateRejection(s.refs, 'Texte non conforme');
    await syncCampaignStatuses(s.ctxAt(20), s.deps());
    expect(rowOf(s.w.db, s.id).status).toBe('rejected');
  });

  it('rien ne change chez Meta : aucun changement, aucune ligne d’historique, mais la date de synchronisation avance', async () => {
    const s = await syncWorld();
    const report = await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(report).toMatchObject({ scanned: 1, unchanged: 1, changed: 0 });
    expect(events(s, 'poll')).toHaveLength(0);
    expect(rowOf(s.w.db, s.id).status_synced_at).toBe(s.ctxAt(15).now().toISOString());
  });

  it('idempotente : rejouer la passe ne change rien et n’écrit pas deux fois l’historique', async () => {
    const s = await syncWorld();
    s.fake.simulateApproval(s.refs);
    await syncCampaignStatuses(s.ctxAt(15), s.deps());
    const again = await syncCampaignStatuses(s.ctxAt(30), s.deps());
    expect(again).toMatchObject({ changed: 0, unchanged: 1 });
    expect(events(s, 'poll')).toHaveLength(1);
  });

  it('LECTURE SEULE chez Meta : getStatus est le seul appel, jamais de pause, reprise, création ni suppression', async () => {
    const s = await syncWorld();
    const { connector, calls } = counting(s);
    await syncCampaignStatuses(s.ctxAt(15), s.deps({ connector }));
    expect(calls).toEqual(['getStatus']);
    expect(s.fake.createAttempts).toBe(1); // la publication d'essai, jamais la synchronisation
    expect(s.fake.pauseAttempts).toBe(0);
    expect(s.fake.resumeAttempts).toBe(1); // l'activation de la publication d'essai
  });

  it('ne regarde ni les brouillons, ni les campagnes sans identifiant Meta, ni les campagnes déjà refusées ou arrêtées', async () => {
    const s = await syncWorld();
    const { connector, calls } = counting(s);
    for (const status of ['draft', 'rejected', 'stopped', 'ended', 'error']) {
      rowOf(s.w.db, s.id).status = status;
      await syncCampaignStatuses(s.ctxAt(15), s.deps({ connector }));
    }
    expect(calls).toEqual([]);
    rowOf(s.w.db, s.id).status = 'active';
    rowOf(s.w.db, s.id).meta_campaign_id = null;
    await syncCampaignStatuses(s.ctxAt(15), s.deps({ connector }));
    expect(calls).toEqual([]);
  });

  it('perte de course : si le client met la campagne en pause pendant la lecture, rien n’est écrasé et aucun historique n’est écrit', async () => {
    const s = await syncWorld({ activateAs: 'active' });
    rowOf(s.w.db, s.id).status = 'active';
    s.fake.simulateApproval(s.refs);
    fakeStatus(s, 'paused');
    // Entre la lecture du statut et l'écriture, le client met en pause chez Pubeka.
    s.w.db.beforeUpdate = (table, db) => {
      if (table !== 'campaigns') return;
      const row = db.rows('campaigns').find((r) => r.id === s.id);
      if (row?.status === 'active') row.status = 'paused';
      db.beforeUpdate = undefined;
    };
    const report = await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(report.changed).toBe(0);
    expect(rowOf(s.w.db, s.id).status).toBe('paused');
    expect(events(s, 'poll')).toHaveLength(0);
  });
});

describe('EC-META-08 — Meta fait foi pour le statut', () => {
  it('pause faite dans le gestionnaire de Meta : active → paused, paused_at posé', async () => {
    const s = await syncWorld();
    rowOf(s.w.db, s.id).status = 'active';
    fakeStatus(s, 'paused');
    await syncCampaignStatuses(s.ctxAt(15), s.deps());
    const row = rowOf(s.w.db, s.id);
    expect(row.status).toBe('paused');
    expect(row.paused_at).toBe(s.ctxAt(15).now().toISOString());
  });

  it('reprise faite chez Meta : paused → active, paused_at effacé', async () => {
    const s = await syncWorld();
    Object.assign(rowOf(s.w.db, s.id), { status: 'paused', paused_at: '2026-10-12T10:00:00Z' });
    fakeStatus(s, 'active');
    await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(rowOf(s.w.db, s.id)).toMatchObject({ status: 'active', paused_at: null });
  });

  it('campagne supprimée chez Meta : → stopped, et l’historique est CONSERVÉ', async () => {
    const s = await syncWorld();
    rowOf(s.w.db, s.id).status = 'active';
    s.w.db.rows('campaign_status_events').push({
      id: 900,
      workspace_id: W,
      campaign_id: s.id,
      status: 'in_review',
      source: 'user',
      payload: null,
      created_at: '2026-10-12T09:00:00Z',
    });
    s.fake.campaigns.get(s.refs.campaignId)!.statusOverride = {
      status: 'stopped',
      rawStatus: 'DELETED',
    };
    await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(rowOf(s.w.db, s.id).status).toBe('stopped');
    expect(events(s).map((e) => e.status)).toEqual(
      expect.arrayContaining(['in_review', 'stopped']),
    );
  });

  it('EC-META-08 : pub supprimée chez Meta PENDANT LA VÉRIFICATION : in_review → stopped, historique conservé, plus relue ensuite', async () => {
    const s = await syncWorld();
    expect(rowOf(s.w.db, s.id).status).toBe('in_review');
    s.fake.simulateRemoteStatus(s.refs, { status: 'stopped', rawStatus: 'DELETED' });
    const first = await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(first).toMatchObject({ changed: 1, journaled: 0 });
    expect(rowOf(s.w.db, s.id).status).toBe('stopped');
    expect(events(s).map((e) => e.status)).toEqual(
      expect.arrayContaining(['in_review', 'stopped']),
    );
    expect(events(s, 'poll')).toMatchObject([
      { status: 'stopped', payload: { event: 'stop', from: 'in_review', raw_status: 'DELETED' } },
    ]);
    // Arrêtée : la passe suivante ne la relit plus (aucun appel inutile à Meta).
    const { connector, calls } = counting(s);
    await syncCampaignStatuses(s.ctxAt(30), s.deps({ connector }));
    expect(calls).toEqual([]);
  });

  it('paiement refusé chez Meta (PENDING_BILLING_INFO) : → stopped ; la relance reste une action du client', async () => {
    const s = await syncWorld();
    rowOf(s.w.db, s.id).status = 'active';
    s.fake.simulateRemoteStatus(s.refs, { status: 'error', rawStatus: 'PENDING_BILLING_INFO' });
    await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(rowOf(s.w.db, s.id).status).toBe('stopped');
    // Meta répond de nouveau « ACTIVE » : la campagne arrêtée n'est PAS relancée toute seule.
    s.fake.simulateRemoteStatus(s.refs, { status: 'active', rawStatus: 'ACTIVE' });
    await syncCampaignStatuses(s.ctxAt(30), s.deps());
    expect(rowOf(s.w.db, s.id).status).toBe('stopped');
  });

  it('date de fin dépassée : active → ended', async () => {
    const s = await syncWorld();
    Object.assign(rowOf(s.w.db, s.id), { status: 'active', end_date: '2026-10-11' });
    fakeStatus(s, 'active');
    await syncCampaignStatuses(s.ctxAt(15), s.deps());
    expect(rowOf(s.w.db, s.id).status).toBe('ended');
  });

  it('WITH_ISSUES : journalisé UNE seule fois, le statut ne change pas', async () => {
    const s = await syncWorld();
    rowOf(s.w.db, s.id).status = 'active';
    s.fake.simulateRemoteStatus(s.refs, { status: 'error', rawStatus: 'WITH_ISSUES' });
    const first = await syncCampaignStatuses(s.ctxAt(15), s.deps());
    const second = await syncCampaignStatuses(s.ctxAt(30), s.deps());
    expect(first.journaled).toBe(1);
    expect(second.journaled).toBe(0);
    expect(rowOf(s.w.db, s.id).status).toBe('active');
    expect(events(s, 'poll')).toEqual([
      expect.objectContaining({
        status: 'meta_status',
        payload: { raw_status: 'WITH_ISSUES', reason: 'needs_attention' },
      }),
    ]);
  });
});

describe('Webhook de Meta : un SIGNAL, pas une vérité', () => {
  function signal(s: SyncWorld, createdAt: string): void {
    s.w.db.rows('campaign_status_events').push({
      id: 500 + s.w.db.rows('campaign_status_events').length,
      workspace_id: W,
      campaign_id: s.id,
      status: 'in_process',
      source: 'webhook',
      payload: {},
      created_at: createdAt,
    });
  }

  it('la passe « webhook » ne regarde QUE les campagnes qui ont reçu un signal depuis leur dernière synchronisation', async () => {
    const s = await syncWorld();
    s.fake.simulateApproval(s.refs);
    const none = await syncCampaignStatuses(s.ctxAt(1), s.deps(), { scope: 'webhook' });
    expect(none.scanned).toBe(0);
    expect(rowOf(s.w.db, s.id).status).toBe('in_review');
    signal(s, s.ctxAt(1).now().toISOString());
    const done = await syncCampaignStatuses(s.ctxAt(2), s.deps(), { scope: 'webhook' });
    expect(done).toMatchObject({ scanned: 1, changed: 1 });
    expect(rowOf(s.w.db, s.id).status).toBe('active');
    // Le signal est consommé : la même passe ne le retraite pas.
    const again = await syncCampaignStatuses(s.ctxAt(3), s.deps(), { scope: 'webhook' });
    expect(again.scanned).toBe(0);
  });

  it('un webhook ne change JAMAIS le statut à lui seul : le statut vient de la relecture chez Meta', async () => {
    const s = await syncWorld();
    signal(s, s.ctxAt(1).now().toISOString());
    // Meta dit toujours « en relecture » : le signal « in_process » n'a rien changé.
    await syncCampaignStatuses(s.ctxAt(2), s.deps(), { scope: 'webhook' });
    expect(rowOf(s.w.db, s.id).status).toBe('in_review');
  });
});

describe('EC-META-10 — limite de débit de Meta', () => {
  function limited(s: SyncWorld, code: number): PlatformConnector {
    return new Proxy(s.fake, {
      get(target, key, receiver) {
        if (key === 'getStatus') {
          return () => Promise.reject(new MetaGraphError({ code, message: 'limite' }, 400));
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  }

  it.each([4, 17, 613, 80000, 80003, 80004, 80014])(
    'code %i : la passe s’arrête sans insister, les valeurs restent, rien n’est compté comme une panne',
    async (code) => {
      const s = await syncWorld();
      const report = await syncCampaignStatuses(
        s.ctxAt(15),
        s.deps({ connector: limited(s, code) }),
      );
      expect(report).toMatchObject({ scanned: 1, rateLimited: true, changed: 0, errors: 0 });
      const row = rowOf(s.w.db, s.id);
      expect(row.status).toBe('in_review');
      expect(row.status_synced_at ?? null).toBeNull();
    },
  );

  it('une autre erreur de Meta (code 100) est comptée comme une erreur, pas comme une limite', async () => {
    const s = await syncWorld();
    const report = await syncCampaignStatuses(s.ctxAt(15), s.deps({ connector: limited(s, 100) }));
    expect(report).toMatchObject({ rateLimited: false, errors: 1 });
  });

  it('limite au niveau d’un compte publicitaire : les autres comptes sont encore synchronisés ; au niveau de l’application : on arrête tout', async () => {
    const s = await syncWorld();
    const app = await syncCampaignStatuses(s.ctxAt(15), s.deps({ connector: limited(s, 4) }));
    expect(app.rateLimited).toBe(true);
    const account = await syncCampaignStatuses(
      s.ctxAt(30),
      s.deps({ connector: limited(s, 80004) }),
    );
    expect(account.rateLimited).toBe(true);
    // La passe suivante, sans limite, reprend normalement.
    s.fake.simulateApproval(s.refs);
    const ok = await syncCampaignStatuses(s.ctxAt(45), s.deps());
    expect(ok).toMatchObject({ changed: 1, rateLimited: false });
  });
});

describe('Jeton Meta expiré', () => {
  it('connexion expirée : aucun appel à Meta, la campagne est comptée en erreur', async () => {
    const s = await syncWorld();
    const connection = s.w.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.status = 'expired';
    const { connector, calls } = counting(s);
    const report = await syncCampaignStatuses(s.ctxAt(15), s.deps({ connector }));
    expect(report.errors).toBe(1);
    expect(calls).toEqual([]);
  });
});

describe('Lot borné', () => {
  it('au plus `limit` campagnes par passage, les jamais synchronisées d’abord', async () => {
    const s = await syncWorld();
    const report = await syncCampaignStatuses(s.ctxAt(15), s.deps(), { limit: 1 });
    expect(report.scanned).toBe(1);
    expect(MIN).toBe(60_000);
  });
});

describe('Candidats : le tri et la limite se font DANS la base (jamais en mémoire sur un lot déjà tronqué)', () => {
  const RECENT = '2026-10-12T08:30:00.000Z';

  /** `count` copies de la campagne publiée, toutes déjà synchronisées récemment ; la dernière ligne est la cible, jamais synchronisée. */
  async function crowded(
    count: number,
  ): Promise<{ s: SyncWorld; target: string; fillers: string[] }> {
    const s = await syncWorld();
    const original = rowOf(s.w.db, s.id);
    original.status_synced_at = RECENT;
    const fillers: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = s.w.db.nextId();
      fillers.push(id);
      s.w.db.rows('campaigns').push({ ...original, id, status_synced_at: RECENT });
    }
    const target = s.w.db.nextId();
    s.w.db.rows('campaigns').push({ ...original, id: target, status_synced_at: null });
    return { s, target, fillers };
  }

  it('au-delà de 1 000 campagnes, la jamais synchronisée passe en premier même si elle est la dernière ligne', async () => {
    const { s, target } = await crowded(1005);
    const report = await syncCampaignStatuses(s.ctxAt(15), s.deps(), { limit: 1 });
    expect(report.scanned).toBe(1);
    expect(rowOf(s.w.db, target).status_synced_at).toBe(s.ctxAt(15).now().toISOString());
  });

  it('ordre : jamais synchronisées d’abord, puis les plus anciennes', async () => {
    const s = await syncWorld();
    const original = rowOf(s.w.db, s.id);
    const ids = [
      '2026-10-12T08:00:00.000Z',
      '2026-10-12T06:00:00.000Z',
      '2026-10-12T07:00:00.000Z',
    ].map((at) => {
      const id = s.w.db.nextId();
      s.w.db.rows('campaigns').push({ ...original, id, status_synced_at: at });
      return id;
    });
    original.status_synced_at = '2026-10-12T09:00:00.000Z';
    await syncCampaignStatuses(s.ctxAt(15), s.deps(), { limit: 2 });
    const synced = ids.filter(
      (id) => rowOf(s.w.db, id).status_synced_at === s.ctxAt(15).now().toISOString(),
    );
    expect(synced).toEqual([ids[1], ids[2]]);
  });
});
