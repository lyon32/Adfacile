// TR-PAY-07, EC-PAY-11 : la tâche planifiée qui met en pause les publicités des espaces VERROUILLÉS. Horloge FIXÉE aux frontières
// (J+3 exact, essai fini à la milliseconde), FAUSSE Meta. Jamais de reprise automatique, aucun autre espace touché.
import { AppError } from '@pubeka/contracts';
import { MetaGraphError } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { pauseAllCampaigns } from './lock-actions';
import { OTHER_W, W } from '../campaigns.test-helper';
import { rowOf } from '../publish/publish.test-helper';
import { LOCK_PAUSE_CAMPAIGNS_PER_PASS, pauseLockedWorkspaces } from './lock-pause-sweep';
import { DAY, lockWorld, PERIOD_END, type LockWorld } from './lock.test-helper';

const at = (ms: number) => new Date(ms);
const GRACE_END = PERIOD_END + 3 * DAY;

function subscription(t: LockWorld, workspaceId: string, over: Record<string, unknown>) {
  const rows = t.w.db.rows('subscriptions');
  const base = rows.find((r) => r.workspace_id === W);
  rows.push({
    ...base,
    workspace_id: workspaceId,
    created_at: '2026-10-02T00:00:00.000Z',
    ...over,
  });
}

describe('EC-PAY-11 — fin de grâce : horloge fixée aux frontières', () => {
  it('J+3 moins une milliseconde : encore en grâce, rien n’est mis en pause', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END - 1)), t.deps);
    expect(report).toMatchObject({ workspaces: 0, paused: 0 });
    expect(rowOf(t.w.db, id).status).toBe('active');
    expect(t.fake.pauseAttempts).toBe(0);
  });

  it('J+3 EXACT : l’espace est verrouillé, toutes ses publicités sont en pause chez Meta et dans Pubeka', async () => {
    const t = lockWorld();
    const a = await t.add('active');
    const b = await t.add('in_review');
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    expect(report).toMatchObject({ workspaces: 1, not_locked: 0, paused: 2, failed: [] });
    for (const id of [a, b]) {
      expect(t.metaStatus(id)).toBe('paused');
      expect(rowOf(t.w.db, id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    }
  });

  it('grâce prolongée par l’administration (`grace_until`) : la nouvelle échéance fait foi', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const extended = PERIOD_END + 10 * DAY;
    Object.assign(t.w.db.rows('subscriptions')[0] ?? {}, {
      grace_until: new Date(extended).toISOString(),
    });
    expect((await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps)).paused).toBe(0);
    expect((await pauseLockedWorkspaces(t.serviceAt(at(extended - 1)), t.deps)).paused).toBe(0);
    expect((await pauseLockedWorkspaces(t.serviceAt(at(extended)), t.deps)).paused).toBe(1);
    expect(rowOf(t.w.db, id).status).toBe('paused');
  });

  it('essai terminé SANS abonnement : verrouillé tout de suite, à la milliseconde de la fin', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    Object.assign(t.w.db.rows('subscriptions')[0] ?? {}, { status: 'trialing' });
    expect((await pauseLockedWorkspaces(t.serviceAt(at(PERIOD_END - 1)), t.deps)).paused).toBe(0);
    expect((await pauseLockedWorkspaces(t.serviceAt(at(PERIOD_END)), t.deps)).paused).toBe(1);
    expect(rowOf(t.w.db, id).status).toBe('paused');
  });

  it('sans abonnement du tout : jamais verrouillé (limites Starter), rien n’est mis en pause', async () => {
    const t = lockWorld();
    await t.add('active');
    t.w.db.rows('subscriptions').splice(0);
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END + 400 * DAY)), t.deps);
    expect(report.paused).toBe(0);
  });
});

describe('aucun autre compte touché', () => {
  it('un espace verrouillé est mis en pause ; un espace à jour et son voisin non verrouillé restent en diffusion', async () => {
    const t = lockWorld();
    const locked = await t.add('active');
    const fine = await t.add('active', { workspaceId: OTHER_W, name: 'Autre compte' });
    subscription(t, OTHER_W, { status: 'active', period_end: '2027-01-01T00:00:00.000Z' });
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    expect(report).toMatchObject({ workspaces: 1, paused: 1 });
    expect(rowOf(t.w.db, locked).status).toBe('paused');
    expect(rowOf(t.w.db, fine).status).toBe('active');
    expect(t.metaStatus(fine)).toBe('active');
    expect(t.fake.pauseAttempts).toBe(1);
  });

  it('deux espaces verrouillés : chacun a ses propres campagnes mises en pause', async () => {
    const t = lockWorld();
    const a = await t.add('active');
    const b = await t.add('in_review', { workspaceId: OTHER_W });
    subscription(t, OTHER_W, { status: 'active', period_end: '2026-11-01T00:00:00.000Z' });
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    expect(report).toMatchObject({ workspaces: 2, paused: 2 });
    expect(rowOf(t.w.db, a).status).toBe('paused');
    expect(rowOf(t.w.db, b).status).toBe('paused');
  });

  it('renouvelé entre la liste et le traitement : l’espace est relu, il n’est PAS mis en pause', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    // La liste (SQL) le croit verrouillé ; au moment d'agir, l'abonnement vient d'être renouvelé.
    const original = Reflect.get(t.w.db, 'rpc') as (...a: unknown[]) => Promise<unknown>;
    Reflect.set(t.w.db, 'rpc', async (...args: unknown[]) => {
      const answer = await original(...args);
      Object.assign(t.w.db.rows('subscriptions')[0] ?? {}, {
        period_end: '2027-06-01T00:00:00.000Z',
      });
      return answer;
    });
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    expect(report).toMatchObject({ workspaces: 1, not_locked: 1, paused: 0 });
    expect(rowOf(t.w.db, id).status).toBe('active');
    expect(t.fake.pauseAttempts).toBe(0);
  });
});

describe('rejouable sans double effet, jamais de reprise', () => {
  it('relancer la tâche : aucun second ordre à Meta, aucun second historique', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const ctx = t.serviceAt(at(GRACE_END));
    await pauseLockedWorkspaces(ctx, t.deps);
    const again = await pauseLockedWorkspaces(ctx, t.deps);
    expect(again).toMatchObject({ workspaces: 0, paused: 0 });
    expect(t.fake.pauseAttempts).toBe(1);
    expect(t.w.db.rows('campaign_status_events').filter((e) => e.campaign_id === id)).toHaveLength(
      1,
    );
  });

  it('au renouvellement les publicités RESTENT en pause : la tâche ne reprend rien, même relancée', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    // Renouvellement : nouvelle période.
    Object.assign(t.w.db.rows('subscriptions')[0] ?? {}, {
      period_end: '2027-06-01T00:00:00.000Z',
    });
    const after = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END + DAY)), t.deps);
    expect(after.paused).toBe(0);
    expect(rowOf(t.w.db, id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    expect(t.metaStatus(id)).toBe('paused');
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it('un échec chez Meta (réseau) ne marque rien ; la passe suivante réessaie et réussit', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    t.fake.simulateTransientError(1);
    const first = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    expect(first.paused).toBe(0);
    expect(first.failed).toMatchObject([{ campaign_id: id, workspace_id: W, code: 'meta_error' }]);
    expect(rowOf(t.w.db, id).status).toBe('active');
    const second = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END + 10 * 60_000)), t.deps);
    expect(second.paused).toBe(1);
    expect(rowOf(t.w.db, id).status).toBe('paused');
  });

  it('le budget par passage est respecté', async () => {
    const t = lockWorld();
    await t.add('active');
    await t.add('active');
    await t.add('active');
    const first = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps, {
      campaignBudget: 2,
    });
    expect(first).toMatchObject({ paused: 2, budget_exhausted: true });
    const second = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps);
    expect(second.paused).toBe(1);
    expect(LOCK_PAUSE_CAMPAIGNS_PER_PASS).toBeGreaterThan(0);
  });

  it('l’interrupteur PUBEKA_META_PUBLISH désactivé ne bloque jamais la pause', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const deps = { ...t.deps, metaPublishEnabled: () => false };
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), deps);
    expect(report.paused).toBe(1);
    expect(rowOf(t.w.db, id).status).toBe('paused');
  });
});

describe('revue adversariale S19b — renouvellement pendant la passe, budget et échecs locaux', () => {
  it('l’espace est renouvelé APRÈS la 1re campagne : la suivante n’est pas mise en pause (accès relu avant chaque campagne)', async () => {
    const t = lockWorld();
    const first = await t.add('active');
    const second = await t.add('active');
    const deps = {
      ...t.deps,
      connector: new Proxy(t.fake, {
        get(target, key, receiver) {
          if (key === 'pause') {
            return (...args: Parameters<typeof t.fake.pause>) => {
              // Le client paie pendant la passe : la période suivante rouvre l'espace.
              Object.assign(t.w.db.rows('subscriptions')[0] ?? {}, {
                period_end: '2027-06-01T00:00:00.000Z',
              });
              return t.fake.pause(...args);
            };
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), deps);
    expect(report.paused).toBe(1);
    expect(report.not_locked).toBe(1);
    expect(rowOf(t.w.db, first).status).toBe('paused');
    expect(rowOf(t.w.db, second).status).toBe('active');
  });

  it('une campagne en échec LOCAL (jeton expiré) ne consomme pas le budget : les autres campagnes du passage sont servies', async () => {
    const t = lockWorld();
    const broken = await t.add('active', { name: 'Compte en panne' });
    const other = await t.add('active', { workspaceId: OTHER_W, name: 'Autre compte' });
    subscription(t, OTHER_W, { status: 'active', period_end: '2026-11-01T00:00:00.000Z' });
    Object.assign(t.w.db.rows('meta_connections')[0] ?? {}, { status: 'expired' });
    const report = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), t.deps, {
      campaignBudget: 1,
    });
    expect(report.paused).toBe(1);
    expect(rowOf(t.w.db, other).status).toBe('paused');
    expect(rowOf(t.w.db, broken).status).toBe('active');
  });
});

describe('contrôle indépendant S19b — recul progressif des échecs permanents', () => {
  const MIN10 = 10 * 60_000;

  async function failingWorld() {
    const t = lockWorld();
    const id = await t.add('active');
    // Échec permanent : Meta refuse toujours (pub supprimée, jeton révoqué…).
    const deps = {
      ...t.deps,
      connector: new Proxy(t.fake, {
        get(target, key, receiver) {
          if (key === 'pause') return () => Promise.reject(new AppError('meta_error'));
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    return { t, id, deps };
  }

  it('chaque échec double le délai (10, 20, 40 min…) et la campagne n’est PAS retentée avant l’échéance', async () => {
    const { t, id, deps } = await failingWorld();
    const first = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), deps);
    expect(first.failed).toHaveLength(1);
    expect(rowOf(t.w.db, id)).toMatchObject({
      lock_pause_failures: 1,
      lock_pause_retry_at: new Date(GRACE_END + MIN10).toISOString(),
    });
    // Avant l'échéance : aucune tentative, aucun bruit.
    const early = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END + MIN10 - 1)), deps);
    expect(early).toMatchObject({ workspaces: 0, failed: [] });
    // À l'échéance : nouvelle tentative, nouvel échec, délai doublé.
    const second = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END + MIN10)), deps);
    expect(second.failed).toHaveLength(1);
    expect(rowOf(t.w.db, id)).toMatchObject({
      lock_pause_failures: 2,
      lock_pause_retry_at: new Date(GRACE_END + MIN10 + 2 * MIN10).toISOString(),
    });
  });

  it('le délai est plafonné à 6 heures', async () => {
    const { t, id, deps } = await failingWorld();
    Object.assign(rowOf(t.w.db, id), { lock_pause_failures: 20 });
    await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), deps);
    expect(rowOf(t.w.db, id).lock_pause_retry_at).toBe(
      new Date(GRACE_END + 6 * 3600_000).toISOString(),
    );
  });

  it('un succès ultérieur met la campagne en pause et efface le recul', async () => {
    const { t, id, deps } = await failingWorld();
    await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), deps);
    const ok = await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END + MIN10)), t.deps);
    expect(ok.paused).toBe(1);
    expect(rowOf(t.w.db, id)).toMatchObject({
      status: 'paused',
      lock_pause_failures: 0,
      lock_pause_retry_at: null,
    });
  });

  it('une limite de débit de Meta n’est pas un échec permanent : aucun recul', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    const deps = {
      ...t.deps,
      connector: new Proxy(t.fake, {
        get(target, key, receiver) {
          if (key === 'pause') {
            return () => Promise.reject(new MetaGraphError({ code: 4, message: 'limite' }, 400));
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    await pauseLockedWorkspaces(t.serviceAt(at(GRACE_END)), deps);
    expect(rowOf(t.w.db, id).lock_pause_failures ?? 0).toBe(0);
  });

  it('un clic du client (pause-all) ignore le recul : la pause est sans danger à rejouer', async () => {
    const t = lockWorld();
    const id = await t.add('active');
    Object.assign(rowOf(t.w.db, id), {
      lock_pause_failures: 4,
      lock_pause_retry_at: new Date(GRACE_END + DAY).toISOString(),
    });
    const result = await pauseAllCampaigns(t.memberAt('locked'), t.deps);
    expect(result.paused).toBe(1);
  });
});
