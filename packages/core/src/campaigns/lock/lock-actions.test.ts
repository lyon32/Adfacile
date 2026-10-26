// TR-PAY-07, EC-PAY-11 : les deux boutons du client. « Mettre toutes mes publicités en pause » (permis verrouillé) et
// « Reprendre mes pubs » (espace actif, reprise MANUELLE de celles du verrouillage seulement, interrupteur de publication).
import { AppError } from '@pubeka/contracts';
import { MetaGraphError } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { rowOf } from '../publish/publish.test-helper';
import { pauseCampaign } from '../publish/campaign-control';
import { pauseAllCampaigns, resumeLockedCampaigns } from './lock-actions';
import { lockWorld } from './lock.test-helper';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error('AppError attendue');
}

describe('pauseAllCampaigns — bouton « Mettre toutes mes publicités en pause »', () => {
  it('espace VERROUILLÉ : permis, toutes les publicités en pause chez Meta, motif billing_lock posé', async () => {
    const t = lockWorld();
    const a = await t.add('active');
    const b = await t.add('in_review');
    const result = await pauseAllCampaigns(t.memberAt('locked'), t.deps);
    expect(result).toEqual({ paused: 2, failed: [], rate_limited: false });
    for (const id of [a, b]) {
      expect(t.metaStatus(id)).toBe('paused');
      expect(rowOf(t.w.db, id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    }
    expect(t.w.db.rows('campaign_status_events').map((e) => e.source)).toEqual(['user', 'user']);
  });

  it.each(['grace', 'active', 'read_only', 'suspended'] as const)(
    'espace %s : permis aussi (le client peut toujours arrêter de dépenser), mais SANS motif de verrouillage',
    async (access) => {
      const t = lockWorld();
      const id = await t.add('active');
      const result = await pauseAllCampaigns(t.memberAt(access), t.deps);
      expect(result.paused).toBe(1);
      expect(rowOf(t.w.db, id).status).toBe('paused');
      expect(rowOf(t.w.db, id).pause_reason ?? null).toBeNull();
    },
  );

  it('éditeur : permis ; lecteur : refusé avant tout appel à Meta', async () => {
    const t = lockWorld();
    await t.add('active');
    expect((await pauseAllCampaigns(t.memberAt('locked', 'editor'), t.deps)).paused).toBe(1);
    const u = lockWorld();
    await u.add('active');
    expect(await codeOf(pauseAllCampaigns(u.memberAt('locked', 'viewer'), u.deps))).toBe(
      'role_insufficient',
    );
    expect(u.fake.pauseAttempts).toBe(0);
  });

  it('jamais bloqué par l’interrupteur de publication réelle (la pause ARRÊTE la dépense)', async () => {
    const t = lockWorld();
    await t.add('active');
    const deps = { ...t.deps, metaPublishEnabled: () => false };
    expect((await pauseAllCampaigns(t.memberAt('locked'), deps)).paused).toBe(1);
  });

  it('une campagne échoue, l’autre réussit : le bilan dit lesquelles', async () => {
    const t = lockWorld();
    const first = await t.add('active', { name: 'Promo A' });
    const second = await t.add('active', { name: 'Promo B' });
    t.fake.simulatePauseRefusal(new AppError('meta_token_expired'));
    const result = await pauseAllCampaigns(t.memberAt('locked'), t.deps);
    expect(result.paused).toBe(1);
    expect(result.failed).toMatchObject([
      { campaign_id: first, name: 'Promo A', code: 'meta_token_expired' },
    ]);
    expect(rowOf(t.w.db, first).status).toBe('active');
    expect(rowOf(t.w.db, second).status).toBe('paused');
  });

  it('idempotente : un second appel ne repause rien et ne ré-écrit pas l’historique', async () => {
    const t = lockWorld();
    await t.add('active');
    await pauseAllCampaigns(t.memberAt('locked'), t.deps);
    const again = await pauseAllCampaigns(t.memberAt('locked'), t.deps);
    expect(again).toEqual({ paused: 0, failed: [], rate_limited: false });
    expect(t.fake.pauseAttempts).toBe(1);
    expect(t.w.db.rows('campaign_status_events')).toHaveLength(1);
  });
});

describe('resumeLockedCampaigns — bouton « Reprendre mes pubs »', () => {
  it('ne reprend QUE les campagnes du verrouillage : celle que le client avait mise en pause lui-même reste en pause', async () => {
    const t = lockWorld();
    const locked1 = await t.add('paused', { pauseReason: 'billing_lock' });
    const locked2 = await t.add('paused', { pauseReason: 'billing_lock' });
    const mine = await t.add('paused');
    const result = await resumeLockedCampaigns(t.memberAt('active'), t.deps);
    expect(result).toEqual({ resumed: 2, failed: [], remaining: 0, rate_limited: false });
    for (const id of [locked1, locked2]) {
      expect(rowOf(t.w.db, id)).toMatchObject({ status: 'active', paused_at: null });
      expect(rowOf(t.w.db, id).pause_reason ?? null).toBeNull();
      expect(t.metaStatus(id)).toBe('active');
    }
    expect(rowOf(t.w.db, mine).status).toBe('paused');
    expect(t.metaStatus(mine)).toBe('paused');
    expect(t.fake.resumeAttempts).toBe(2);
  });

  it('un second appel (double clic, clé neuve) ne reprend plus rien : aucun double effet chez Meta', async () => {
    const t = lockWorld();
    await t.add('paused', { pauseReason: 'billing_lock' });
    await resumeLockedCampaigns(t.memberAt('active'), t.deps);
    const again = await resumeLockedCampaigns(t.memberAt('active'), t.deps);
    expect(again).toMatchObject({ resumed: 0, remaining: 0 });
    expect(t.fake.resumeAttempts).toBe(1);
  });

  it('interrupteur de publication désactivé : refusé AVANT tout appel à Meta, rien ne change', async () => {
    const t = lockWorld();
    const id = await t.add('paused', { pauseReason: 'billing_lock' });
    const deps = { ...t.deps, metaPublishEnabled: () => false };
    expect(await codeOf(resumeLockedCampaigns(t.memberAt('active'), deps))).toBe(
      'provider_unavailable',
    );
    expect(t.fake.resumeAttempts).toBe(0);
    expect(rowOf(t.w.db, id)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
  });

  it.each([
    ['locked', 'workspace_locked'],
    ['grace', 'workspace_read_only'],
    ['read_only', 'workspace_read_only'],
    ['suspended', 'workspace_suspended'],
  ] as const)(
    'espace %s : la reprise est refusée (%s) — seul l’espace actif dépense',
    async (access, code) => {
      const t = lockWorld();
      await t.add('paused', { pauseReason: 'billing_lock' });
      expect(await codeOf(resumeLockedCampaigns(t.memberAt(access), t.deps))).toBe(code);
      expect(t.fake.resumeAttempts).toBe(0);
    },
  );

  it('lecteur : refusé', async () => {
    const t = lockWorld();
    await t.add('paused', { pauseReason: 'billing_lock' });
    expect(await codeOf(resumeLockedCampaigns(t.memberAt('active', 'viewer'), t.deps))).toBe(
      'role_insufficient',
    );
  });

  it('Meta refuse l’une : les autres sont reprises, la refusée reste en pause et le bilan le dit', async () => {
    const t = lockWorld();
    const first = await t.add('paused', { pauseReason: 'billing_lock', name: 'Promo A' });
    const second = await t.add('paused', { pauseReason: 'billing_lock', name: 'Promo B' });
    t.fake.simulateResumeRefusal(new AppError('meta_payment_method_missing'));
    const result = await resumeLockedCampaigns(t.memberAt('active'), t.deps);
    expect(result.resumed).toBe(1);
    expect(result.failed).toMatchObject([
      { campaign_id: first, name: 'Promo A', code: 'meta_payment_method_missing' },
    ]);
    expect(result.remaining).toBe(1);
    expect(rowOf(t.w.db, first)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    expect(rowOf(t.w.db, second).status).toBe('active');
  });

  it('limite de débit de Meta : on s’arrête, rien n’est marqué repris, le client peut recliquer', async () => {
    const t = lockWorld();
    await t.add('paused', { pauseReason: 'billing_lock' });
    const id = await t.add('paused', { pauseReason: 'billing_lock' });
    const deps = {
      ...t.deps,
      connector: new Proxy(t.fake, {
        get(target, key, receiver) {
          if (key === 'resume') {
            return () => Promise.reject(new MetaGraphError({ code: 4, message: 'limite' }, 400));
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    const result = await resumeLockedCampaigns(t.memberAt('active'), deps);
    expect(result).toMatchObject({ resumed: 0, rate_limited: true, remaining: 2 });
    expect(result.failed).toHaveLength(1);
    expect(rowOf(t.w.db, id).status).toBe('paused');
  });

  it('une campagne d’un AUTRE espace en pause pour verrouillage n’est jamais reprise', async () => {
    const t = lockWorld();
    const mine = await t.add('paused', { pauseReason: 'billing_lock' });
    const other = await t.add('paused', {
      pauseReason: 'billing_lock',
      workspaceId: '00000000-0000-4000-8000-0000000000a2',
    });
    const result = await resumeLockedCampaigns(t.memberAt('active'), t.deps);
    expect(result.resumed).toBe(1);
    expect(rowOf(t.w.db, mine).status).toBe('active');
    expect(rowOf(t.w.db, other)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
  });
});

describe('revue adversariale S19b — courses entre le client et « Reprendre mes pubs »', () => {
  it('le client reprend puis remet LUI-MÊME en pause une campagne pendant la boucle : le motif a disparu, elle n’est PAS reprise', async () => {
    const t = lockWorld();
    const first = await t.add('paused', { pauseReason: 'billing_lock', name: 'Promo A' });
    const second = await t.add('paused', { pauseReason: 'billing_lock', name: 'Promo B' });
    const deps = {
      ...t.deps,
      connector: new Proxy(t.fake, {
        get(target, key, receiver) {
          if (key === 'resume') {
            return (...args: Parameters<typeof t.fake.resume>) => {
              // Pendant la reprise de A, le client a repris puis re-pausé B : B est en pause SANS motif.
              Object.assign(rowOf(t.w.db, second), { pause_reason: null });
              return t.fake.resume(...args);
            };
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    const result = await resumeLockedCampaigns(t.memberAt('active'), deps);
    expect(result.resumed).toBe(1);
    expect(rowOf(t.w.db, first).status).toBe('active');
    expect(rowOf(t.w.db, second).status).toBe('paused');
    expect(t.metaStatus(second)).toBe('paused');
    expect(t.fake.resumeAttempts).toBe(1);
  });

  it('pause d’une campagne seule en espace verrouillé : même motif que « tout mettre en pause » ; en espace actif, aucun motif', async () => {
    const locked = lockWorld();
    const a = await locked.add('active');
    await pauseCampaign(locked.memberAt('locked'), a, locked.deps);
    expect(rowOf(locked.w.db, a)).toMatchObject({ status: 'paused', pause_reason: 'billing_lock' });
    const active = lockWorld();
    const b = await active.add('active');
    await pauseCampaign(active.memberAt('active'), b, active.deps);
    expect(rowOf(active.w.db, b).pause_reason ?? null).toBeNull();
  });
});
