// Reprise des publications restées « en publication » (S16) : tâche planifiée `campaign.reconcile`. Elle reprend, par
// RAPPROCHEMENT en lecture seule, les campagnes dont la tâche de publication a conclu « on vérifie » (lecture en panne, liste
// coupée, activation inconnue) ou a été interrompue. Jamais de recréation ; l'activation seulement si l'interrupteur est activé ;
// au-delà de 24 h sans issue : `error`, quota rendu, motif clair. Aucun appel réel : la fausse Meta.
import { FakeMetaConnector, type PlatformToken } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import type { ServiceCtx } from '../../context';
import { addDraft, NOW, W } from '../campaigns.test-helper';
import { publishCampaign } from './publish-campaign';
import {
  RECONCILE_BATCH,
  RECONCILE_GIVE_UP_MS,
  RECONCILE_MIN_AGE_MS,
  reconcilePublications,
} from './reconcile-publications';
import { runPublication, type RunPublicationDeps } from './run-publication';
import { KEY_A, publishWorld, rowOf, type PublishWorld } from './publish.test-helper';

const TOKEN: PlatformToken = { accessToken: 'jeton-de-test', expiresAt: null };
const MIN = 60_000;

interface Stuck {
  w: PublishWorld;
  fake: FakeMetaConnector;
  deps: (over?: Partial<RunPublicationDeps>) => RunPublicationDeps;
  ctxAt: (minutesAfter: number) => ServiceCtx;
  id: string;
}

/** Une campagne publiée par la route, dont la tâche a conclu « on vérifie » (délai avec ou sans création, puis lecture en panne). */
async function stuck(
  over: { created?: boolean } = {},
  shared?: { w: PublishWorld; fake: FakeMetaConnector },
  extraDraft = false,
): Promise<Stuck> {
  const w = shared?.w ?? publishWorld();
  const fake = shared?.fake ?? new FakeMetaConnector();
  let id = w.campaignId;
  if (extraDraft) {
    id = addDraft(w.db, {
      name: 'Autre campagne',
      objective: 'OUTCOME_ENGAGEMENT',
      destination: 'WHATSAPP',
      optimization_goal: 'CONVERSATIONS',
      geo: { countries: ['CM'] },
      targeting: { advantage_plus: true },
      copy: { primary_text: 'Texte.', headline: 'Titre', cta: 'SEND_WHATSAPP_MESSAGE' },
      daily_budget_usd_cents: 500,
      start_date: '2026-10-14',
      end_date: '2026-10-20',
    });
  }
  await publishCampaign(w.ctx, id, { idempotencyKey: KEY_A, acceptLiability: true }, w.deps);
  const deps = (o: Partial<RunPublicationDeps> = {}): RunPublicationDeps => ({
    connector: fake,
    loadToken: () => Promise.resolve(TOKEN),
    metaPublishEnabled: () => true,
    beforeSpend: w.hooks.beforeSpend,
    afterAccepted: w.hooks.afterAccepted,
    release: w.hooks.release,
    ...o,
  });
  const ctxAt = (minutesAfter: number): ServiceCtx => ({
    requestId: 'req_RECONCILE',
    svc: w.db.asService(),
    now: () => new Date(NOW.getTime() + minutesAfter * MIN),
  });
  fake.simulateCreateTimeout({ created: over.created ?? true });
  fake.simulateLookupFailure();
  const first = await runPublication(ctxAt(0), { campaignId: id, workspaceId: W }, deps());
  expect(first.outcome).toBe('pending');
  return { w, fake, deps, ctxAt, id };
}

function counting<T extends object>(target: T): { proxy: T; calls: string[] } {
  const calls: string[] = [];
  const proxy = new Proxy(target, {
    get(obj, key, receiver) {
      const value: unknown = Reflect.get(obj, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(key));
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
  return { proxy, calls };
}

describe('reconcilePublications — qui est repris', () => {
  it('constantes : au moins 5 minutes, abandon après 24 heures, lot borné', () => {
    expect(RECONCILE_MIN_AGE_MS).toBe(5 * MIN);
    expect(RECONCILE_GIVE_UP_MS).toBe(24 * 60 * MIN);
    expect(RECONCILE_BATCH).toBeGreaterThan(0);
  });

  it('une campagne « en publication » depuis MOINS de 5 minutes n’est pas touchée (la tâche est peut-être encore en cours)', async () => {
    const t = await stuck();
    const before = JSON.stringify(t.w.db.rows('campaigns'));
    const { proxy, calls } = counting(t.fake);
    const report = await reconcilePublications(t.ctxAt(4), t.deps({ connector: proxy }));
    expect(report).toMatchObject({ scanned: 0 });
    expect(calls).toEqual([]);
    expect(JSON.stringify(t.w.db.rows('campaigns'))).toBe(before);
  });

  it('ne reprend ni une campagne en phase « none » (aucun appel à Meta n’a eu lieu), ni une campagne qui n’est plus « en publication »', async () => {
    const w = publishWorld();
    await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, acceptLiability: true },
      w.deps,
    );
    const fake = new FakeMetaConnector();
    const deps: RunPublicationDeps = {
      connector: fake,
      loadToken: () => Promise.resolve(TOKEN),
      metaPublishEnabled: () => true,
    };
    const ctx: ServiceCtx = {
      requestId: 'r',
      svc: w.db.asService(),
      now: () => new Date(NOW.getTime() + 60 * MIN),
    };
    expect(await reconcilePublications(ctx, deps)).toMatchObject({ scanned: 0 });
    expect(fake.createAttempts).toBe(0);
    Object.assign(rowOf(w.db, w.campaignId), { status: 'in_review', publish_phase: 'creating' });
    expect(await reconcilePublications(ctx, deps)).toMatchObject({ scanned: 0 });
  });
});

describe('reconcilePublications — règle déterministe pour chaque cas', () => {
  it('trouvée chez Meta et complète : adoptée, activée (interrupteur activé), in_review, quota décompté — une seule création', async () => {
    const t = await stuck();
    const report = await reconcilePublications(t.ctxAt(6), t.deps());
    expect(report).toMatchObject({ scanned: 1, accepted: 1 });
    expect(rowOf(t.w.db, t.id)).toMatchObject({
      status: 'in_review',
      publish_phase: 'done',
      quota_state: 'counted',
    });
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.campaigns.size).toBe(1);
  });

  it('trouvée EN PAUSE, interrupteur DÉSACTIVÉ : aucune activation, reste en publication ; activé ensuite, elle aboutit', async () => {
    const t = await stuck();
    const report = await reconcilePublications(
      t.ctxAt(6),
      t.deps({ metaPublishEnabled: () => false }),
    );
    expect(report).toMatchObject({ scanned: 1, pending: 1 });
    expect(t.fake.resumeAttempts).toBe(0);
    expect(rowOf(t.w.db, t.id)).toMatchObject({ status: 'publishing', quota_state: 'held' });
    expect(await reconcilePublications(t.ctxAt(16), t.deps())).toMatchObject({ accepted: 1 });
    expect(t.fake.resumeAttempts).toBe(1);
    expect(t.fake.createAttempts).toBe(1);
  });

  it('« activation réussie chez Meta mais lecture échouée » : au passage suivant l’état de Pubeka reflète celui de Meta (active → in_review)', async () => {
    const t = await stuck();
    await reconcilePublications(t.ctxAt(6), t.deps({ metaPublishEnabled: () => false }));
    const remote = [...t.fake.campaigns.values()][0];
    if (remote === undefined) throw new Error('campagne chez Meta attendue');
    // L'activation a été ordonnée (phase « activating »), Meta l'a appliquée, mais sa réponse et sa lecture ont échoué.
    remote.status = 'active';
    Object.assign(rowOf(t.w.db, t.id), { publish_phase: 'activating' });
    t.fake.simulateLookupFailure();
    const { proxy } = counting(t.fake);
    // Lecture de l'état (getStatus) en panne : on ne conclut pas.
    const broken = {
      ...t.deps(),
      connector: new Proxy(proxy, {
        get(obj, key, receiver) {
          if (key === 'getStatus') return () => Promise.reject(new Error('Meta illisible'));
          return Reflect.get(obj, key, receiver) as unknown;
        },
      }),
    };
    expect(await reconcilePublications(t.ctxAt(16), broken)).toMatchObject({ pending: 1 });
    expect(rowOf(t.w.db, t.id)).toMatchObject({ status: 'publishing' });
    expect(await reconcilePublications(t.ctxAt(26), t.deps())).toMatchObject({ accepted: 1 });
    expect(rowOf(t.w.db, t.id)).toMatchObject({ status: 'in_review', quota_state: 'counted' });
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it('INTROUVABLE après lecture COMPLÈTE : échec net (incertain), quota rendu, rien n’est recréé', async () => {
    const t = await stuck({ created: false });
    const report = await reconcilePublications(t.ctxAt(6), t.deps());
    expect(report).toMatchObject({ scanned: 1, failed: 1 });
    expect(rowOf(t.w.db, t.id)).toMatchObject({
      status: 'error',
      quota_state: 'released',
      publish_error: { code: 'meta_error', uncertain: true },
    });
    expect(t.w.hooks.count('release')).toBe(1);
    expect(t.fake.createAttempts).toBe(1);
  });

  it('lecture EN PANNE ou liste COUPÉE : rien ne change (statut, phase, quota), nouvelle tentative au passage suivant', async () => {
    const t = await stuck({ created: false });
    t.fake.simulateLookupFailure();
    const before = JSON.stringify(t.w.db.rows('campaigns'));
    expect(await reconcilePublications(t.ctxAt(6), t.deps())).toMatchObject({ pending: 1 });
    expect(JSON.stringify(t.w.db.rows('campaigns'))).toBe(before);
    t.fake.simulateLookupTruncated();
    expect(await reconcilePublications(t.ctxAt(16), t.deps())).toMatchObject({ pending: 1 });
    expect(JSON.stringify(t.w.db.rows('campaigns'))).toBe(before);
    t.fake.simulateLookupTruncated(false);
    expect(await reconcilePublications(t.ctxAt(26), t.deps())).toMatchObject({ failed: 1 });
  });

  it('plus de 24 h sans issue (Meta illisible depuis tout ce temps) : statut error, motif clair, quota rendu ; aucune écriture chez Meta', async () => {
    const t = await stuck();
    t.fake.simulateLookupFailure();
    const { proxy, calls } = counting(t.fake);
    const report = await reconcilePublications(t.ctxAt(24 * 60 + 1), t.deps({ connector: proxy }));
    expect(report).toMatchObject({ scanned: 1, gaveUp: 1 });
    expect(calls.filter((c) => ['createCampaign', 'resume'].includes(c))).toEqual([]);
    const row = rowOf(t.w.db, t.id);
    expect(row).toMatchObject({
      status: 'error',
      quota_state: 'released',
      publish_error: { code: 'meta_error', uncertain: true },
    });
    expect(JSON.stringify(row.publish_error)).toContain('reconcile_timeout');
    expect(t.w.hooks.count('release')).toBe(1);
  });

  it('plus de 24 h MAIS Meta lisible : l’état de Meta l’emporte (pas d’abandon à tort)', async () => {
    const t = await stuck();
    const report = await reconcilePublications(t.ctxAt(24 * 60 + 1), t.deps());
    expect(report).toMatchObject({ accepted: 1, gaveUp: 0 });
    expect(rowOf(t.w.db, t.id).status).toBe('in_review');
  });
});

describe('reconcilePublications — borné, idempotent, isolé', () => {
  it('au plus `limit` campagnes par passage ; le passage suivant reprend le reste', async () => {
    const a = await stuck();
    const b = await stuck({}, { w: a.w, fake: a.fake }, true);
    const c = await stuck({}, { w: a.w, fake: a.fake }, true);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    const one = await reconcilePublications(a.ctxAt(6), a.deps(), { limit: 2 });
    expect(one.scanned).toBe(2);
    const two = await reconcilePublications(a.ctxAt(16), a.deps(), { limit: 2 });
    expect(two.scanned).toBe(1);
    expect(a.fake.createAttempts).toBe(3);
  });

  it('rejouée sans effet double : deuxième passage sans rien à reprendre, une seule création, un seul quota décompté', async () => {
    const t = await stuck();
    await reconcilePublications(t.ctxAt(6), t.deps());
    const again = await reconcilePublications(t.ctxAt(16), t.deps());
    expect(again).toMatchObject({ scanned: 0 });
    expect(t.fake.createAttempts).toBe(1);
    expect(t.w.hooks.count('afterAccepted')).toBe(1);
  });

  it('une exécution qui plante est comptée (errors) et n’empêche pas les suivantes ; jamais avalée en silence', async () => {
    const a = await stuck();
    const b = await stuck({}, { w: a.w, fake: a.fake }, true);
    let calls = 0;
    const flaky = a.deps({
      metaPublishEnabled: () => {
        calls += 1;
        if (calls === 1) throw new Error('base indisponible');
        return true;
      },
    });
    const report = await reconcilePublications(a.ctxAt(6), flaky);
    expect(report).toMatchObject({ scanned: 2, errors: 1, accepted: 1 });
    expect(
      rowOf(a.w.db, b.id).status === 'in_review' || rowOf(a.w.db, a.id).status === 'in_review',
    ).toBe(true);
  });
});
