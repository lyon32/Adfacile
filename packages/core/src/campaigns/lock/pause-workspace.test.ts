// TR-PAY-07, EC-PAY-11, EC-META-07, EC-META-10 : la pause de toutes les publicités d'un espace. FAUSSE Meta uniquement.
// Règle centrale : une campagne n'est JAMAIS marquée « en pause » tant que Meta ne l'a pas confirmé par une relecture du statut.
import { AppError } from '@pubeka/contracts';
import { MetaGraphError, type PlatformConnector } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { NOW, OTHER_W, W } from '../campaigns.test-helper';
import { rowOf } from '../publish/publish.test-helper';
import { firstRefs, lockWorld, type LockWorld } from './lock.test-helper';
import { BILLING_LOCK_REASON, pauseWorkspaceCampaigns } from './pause-workspace';

const run = (
  t: LockWorld,
  over: Partial<Parameters<typeof pauseWorkspaceCampaigns>[3]> = {},
  deps: Parameters<typeof pauseWorkspaceCampaigns>[1] = t.deps,
) =>
  pauseWorkspaceCampaigns(t.serviceAt(NOW), deps, W, {
    source: 'poll',
    reason: BILLING_LOCK_REASON,
    budget: { left: 100 },
    ...over,
  });

const events = (t: LockWorld, id: string) =>
  t.w.db.rows('campaign_status_events').filter((e) => e.campaign_id === id);

/** La fausse Meta dont le connecteur se comporte autrement pour `pause` ou `getStatus`. */
function patched(
  t: LockWorld,
  over: Partial<Record<'pause' | 'getStatus', () => Promise<unknown>>>,
) {
  const connector: PlatformConnector = new Proxy(t.fake, {
    get(target, key, receiver) {
      const replacement = typeof key === 'string' && key in over ? over[key as 'pause'] : undefined;
      if (replacement !== undefined) return replacement;
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === 'function'
        ? (...args: unknown[]) => (value as (...a: unknown[]) => unknown).apply(target, args)
        : value;
    },
  });
  return { ...t.deps, connector };
}

describe('TR-PAY-07 — mise en pause de toutes les publicités', () => {
  it('une campagne en diffusion et une en vérification : Meta les confirme en pause, puis Pubeka (statut, date, motif, historique)', async () => {
    const t = lockWorld();
    const a = await t.add('active');
    const b = await t.add('in_review');
    const report = await run(t);
    expect(report).toMatchObject({ paused: 2, failed: [], rate_limited: false });
    for (const id of [a, b]) {
      expect(t.metaStatus(id)).toBe('paused');
      expect(rowOf(t.w.db, id)).toMatchObject({
        status: 'paused',
        paused_at: NOW.toISOString(),
        pause_reason: 'billing_lock',
      });
    }
    expect(events(t, a)).toMatchObject([
      {
        status: 'paused',
        source: 'poll',
        payload: { event: 'pause', reason: 'billing_lock', from: 'active' },
      },
    ]);
    expect(events(t, b)).toMatchObject([
      { payload: { reason: 'billing_lock', from: 'in_review' } },
    ]);
  });

  it('une campagne en erreur mais connue de Meta (elle peut diffuser) est mise en pause aussi', async () => {
    const t = lockWorld();
    const id = await t.add('error');
    await run(t);
    expect(rowOf(t.w.db, id).status).toBe('paused');
    expect(t.metaStatus(id)).toBe('paused');
  });

  it('une campagne que le client avait déjà mise en pause n’est pas touchée : ni appel à Meta, ni motif, ni historique', async () => {
    const t = lockWorld();
    const mine = await t.add('paused');
    const live = await t.add('active');
    const report = await run(t);
    expect(report.paused).toBe(1);
    expect(rowOf(t.w.db, mine)).toMatchObject({ status: 'paused', pause_reason: null });
    expect(events(t, mine)).toHaveLength(0);
    expect(t.fake.pauseAttempts).toBe(1);
    expect(rowOf(t.w.db, live).pause_reason).toBe('billing_lock');
  });

  it('rejouée : aucun double effet (pas de second ordre à Meta, pas de second historique)', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    await run(t);
    const again = await run(t);
    expect(again).toMatchObject({ paused: 0, failed: [] });
    expect(t.fake.pauseAttempts).toBe(1);
    expect(events(t, id)).toHaveLength(1);
  });

  it('seul l’espace demandé est touché : la campagne d’un AUTRE espace reste en diffusion chez Meta et dans la base', async () => {
    const t = lockWorld();
    const mine = await t.add('active');
    const other = await t.add('active', { workspaceId: OTHER_W, name: 'Autre compte' });
    await run(t);
    expect(rowOf(t.w.db, mine).status).toBe('paused');
    expect(rowOf(t.w.db, other).status).toBe('active');
    expect(t.metaStatus(other)).toBe('active');
    expect(t.fake.pauseAttempts).toBe(1);
  });

  it('une pause du client (hors verrouillage) ne pose aucun motif : la reprise manuelle ne la retrouvera jamais', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    await run(t, { source: 'user', reason: null });
    expect(rowOf(t.w.db, id).status).toBe('paused');
    expect(rowOf(t.w.db, id).pause_reason ?? null).toBeNull();
    expect(events(t, id)).toMatchObject([{ source: 'user', payload: { reason: 'pause_all' } }]);
  });

  it('une campagne en cours de publication n’est pas touchée : elle est signalée (conflict)', async () => {
    const t = lockWorld();
    const id = await t.add('publishing');
    const report = await run(t);
    expect(report.paused).toBe(0);
    expect(report.failed).toMatchObject([{ campaign_id: id, code: 'conflict' }]);
    expect(t.fake.pauseAttempts).toBe(0);
  });
});

describe('EC-META-07 — jamais « en pause » sans la confirmation de Meta', () => {
  it('l’ordre de pause échoue (erreur passagère) : la campagne reste inchangée, l’échec est rapporté, la passe suivante réussit', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    t.fake.simulateTransientError(1);
    const first = await run(t);
    expect(first.paused).toBe(0);
    expect(first.failed).toMatchObject([{ campaign_id: id, code: 'meta_error' }]);
    expect(rowOf(t.w.db, id)).toMatchObject({ status: 'active' });
    expect(rowOf(t.w.db, id).pause_reason ?? null).toBeNull();
    expect(events(t, id)).toHaveLength(0);
    const second = await run(t);
    expect(second.paused).toBe(1);
    expect(rowOf(t.w.db, id).status).toBe('paused');
  });

  it('Meta refuse nettement la pause : la campagne reste en diffusion et le code de Meta remonte', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    t.fake.simulatePauseRefusal(new AppError('meta_token_expired'));
    const report = await run(t);
    expect(report.failed).toMatchObject([{ campaign_id: id, code: 'meta_token_expired' }]);
    expect(rowOf(t.w.db, id).status).toBe('active');
  });

  it('l’ordre est accepté mais la relecture montre encore la campagne en diffusion : NON marquée', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    t.fake.simulateRemoteStatus(firstRefs(t), { status: 'active', rawStatus: 'ACTIVE' });
    const report = await run(t);
    expect(report.paused).toBe(0);
    expect(report.failed).toMatchObject([{ campaign_id: id, code: 'meta_error' }]);
    expect(rowOf(t.w.db, id).status).toBe('active');
    expect(events(t, id)).toHaveLength(0);
  });

  it('la réponse à l’ordre se perd mais Meta a bien mis la campagne en pause (relecture) : marquée, sans second ordre', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const deps = patched(t, {
      pause: async () => {
        await t.fake.pause({ accessToken: 'x', expiresAt: null }, firstRefs(t));
        throw new AppError('meta_error', { cause: new Error('délai dépassé') });
      },
    });
    const report = await run(t, {}, deps);
    expect(report).toMatchObject({ paused: 1, failed: [] });
    expect(rowOf(t.w.db, id).status).toBe('paused');
    expect(t.fake.pauseAttempts).toBe(1);
  });

  it('la relecture échoue après un ordre accepté : NON marquée (Meta n’a rien confirmé), reprise à la passe suivante', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const deps = patched(t, { getStatus: () => Promise.reject(new AppError('meta_error')) });
    const report = await run(t, {}, deps);
    expect(report.paused).toBe(0);
    expect(rowOf(t.w.db, id).status).toBe('active');
    const next = await run(t);
    expect(next.paused).toBe(1);
  });

  it('jeton Meta expiré : aucun appel à Meta, campagne inchangée, code meta_token_expired', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    Object.assign(t.w.db.rows('meta_connections')[0] ?? {}, { status: 'expired' });
    const report = await run(t);
    expect(report.failed).toMatchObject([{ campaign_id: id, code: 'meta_token_expired' }]);
    expect(t.fake.pauseAttempts).toBe(0);
    expect(rowOf(t.w.db, id).status).toBe('active');
  });

  it('une campagne en pause chez Meta par le client entre-temps (déjà « paused » localement) n’est pas écrasée', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    // Quelqu'un la met en pause dans Pubeka juste avant l'écriture locale : le résultat est compté sans second historique.
    const deps = patched(t, {
      pause: async () => {
        await t.fake.pause({ accessToken: 'x', expiresAt: null }, firstRefs(t));
        rowOf(t.w.db, id).status = 'paused';
      },
    });
    const report = await run(t, {}, deps);
    expect(report.paused).toBe(1);
    expect(events(t, id)).toHaveLength(0);
  });
});

describe('EC-META-10 — limites de débit de Meta pendant la pause', () => {
  const limited = (t: LockWorld, code: number) =>
    patched(t, {
      pause: () => Promise.reject(new MetaGraphError({ code, message: 'limite' }, 400)),
    });

  it.each([17, 613, 80004])(
    'code %i (compte publicitaire) : la campagne n’est pas marquée, les autres comptes ne sont pas arrêtés',
    async (code) => {
      const t = lockWorld();
      const id = await t.add('active');
      const report = await run(t, {}, limited(t, code));
      expect(report).toMatchObject({ paused: 0, rate_limited: true });
      expect(report.failed).toMatchObject([{ campaign_id: id, code: 'rate_limited' }]);
      expect(report.failed).toHaveLength(1);
      expect(rowOf(t.w.db, id).status).toBe('active');
    },
  );

  it('code 4 (application) : on arrête tout, sans insister ; la passe suivante, sans limite, reprend', async () => {
    const t = lockWorld();
    const a = await t.add('active');
    await t.add('active');
    const report = await run(t, {}, limited(t, 4));
    expect(report).toMatchObject({ paused: 0, rate_limited: true, app_limited: true });
    expect(report.failed).toHaveLength(1);
    const next = await run(t);
    expect(next.paused).toBe(2);
    expect(rowOf(t.w.db, a).status).toBe('paused');
  });

  it('budget du passage épuisé : au plus ce nombre de campagnes, le reste attend la passe suivante', async () => {
    const t = lockWorld();
    await t.add('active');
    await t.add('active');
    await t.add('in_review');
    const first = await run(t, { budget: { left: 2 } });
    expect(first).toMatchObject({ paused: 2, budget_exhausted: true });
    const second = await run(t);
    expect(second).toMatchObject({ paused: 1, budget_exhausted: false });
  });
});

describe('la pause ne reprend jamais', () => {
  it('aucun ordre `resume` n’est jamais envoyé à Meta par la pause', async () => {
    const t = lockWorld();
    await t.add('active');
    t.fake.resumeAttempts = 0;
    await run(t);
    await run(t);
    expect(t.fake.resumeAttempts).toBe(0);
  });
});
