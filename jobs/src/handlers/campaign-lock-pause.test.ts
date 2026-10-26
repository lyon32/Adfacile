// Tâche `campaign.lock-pause` (S19b, TR-PAY-07, EC-PAY-11) : enregistrement, planification, charge vide et exécution (cas d'usage,
// base et environnement simulés : aucun appel réseau, aucun vrai service).
import type * as CoreModule from '@pubeka/core';
import type * as DbModule from '@pubeka/db';
import type * as SharedModule from '@pubeka/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  env: Object.create(null) as Record<string, string | undefined>,
  clientArgs: [] as unknown[],
  sweepArgs: [] as unknown[],
  depsArgs: [] as unknown[],
}));

vi.mock('@pubeka/shared', async (importOriginal) => {
  const original = await importOriginal<typeof SharedModule>();
  return { ...original, getEnv: () => calls.env, createRequestId: () => 'req_TEST' };
});
vi.mock('@pubeka/db', async (importOriginal) => {
  const original = await importOriginal<typeof DbModule>();
  return {
    ...original,
    createServiceClient: (args: unknown) => {
      calls.clientArgs.push(args);
      return { marker: 'service-client' };
    },
  };
});
vi.mock('@pubeka/core', async (importOriginal) => {
  const original = await importOriginal<typeof CoreModule>();
  return {
    ...original,
    createCampaignControlDeps: (...args: unknown[]) => {
      calls.depsArgs.push(args);
      return { marker: 'deps' };
    },
    pauseLockedWorkspaces: (...args: unknown[]) => {
      calls.sweepArgs.push(args);
      return Promise.resolve({ workspaces: 0, paused: 0 });
    },
  };
});

const { inlineHandlers } = await import('../create-dispatcher');
const { runHandler } = await import('../dispatcher');
const { CAMPAIGN_LOCK_PAUSE_CRON, campaignLockPauseHandler, campaignLockPausePayloadSchema } =
  await import('./campaign-lock-pause');

const NOW = new Date('2026-11-04T00:00:00Z');
const ctx = { now: () => NOW, runtime: 'inline' as const };

beforeEach(() => {
  calls.clientArgs.length = 0;
  calls.sweepArgs.length = 0;
  calls.depsArgs.length = 0;
  for (const key of Object.keys(calls.env)) Reflect.deleteProperty(calls.env, key);
  calls.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  calls.env.SUPABASE_SECRET_KEY = 'sb_secret_factice';
});

describe('tâche campaign.lock-pause (S19b)', () => {
  it('porte l’identifiant campaign.lock-pause et est enregistrée pour le mode inline', () => {
    expect(campaignLockPauseHandler.id).toBe('campaign.lock-pause');
    expect(inlineHandlers.map((h) => h.id)).toContain('campaign.lock-pause');
  });

  it('est planifiée toutes les 10 minutes', () => {
    expect(CAMPAIGN_LOCK_PAUSE_CRON).toBe('*/10 * * * *');
  });

  it('ne reçoit aucune donnée : un objet vide, rien en plus (jamais un jeton ni un identifiant d’espace)', () => {
    expect(campaignLockPausePayloadSchema.safeParse({}).success).toBe(true);
    for (const bad of [{ workspaceId: 'x' }, { token: 'secret' }, null, 'x']) {
      expect(campaignLockPausePayloadSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('refuse une charge invalide avant toute exécution (validation_failed)', async () => {
    await expect(
      runHandler(campaignLockPauseHandler, { workspaceId: 'x' }, ctx),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(calls.sweepArgs).toHaveLength(0);
  });

  it('lance une passe avec le client de service, l’heure du contexte et les dépendances de l’environnement', async () => {
    const result = await campaignLockPauseHandler.run({}, ctx);
    expect(result).toEqual({ workspaces: 0, paused: 0 });
    expect(calls.clientArgs).toEqual([
      { url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_factice' },
    ]);
    const [serviceCtx, deps] = calls.sweepArgs[0] as [
      { requestId: string; now: () => Date },
      unknown,
    ];
    expect(serviceCtx.requestId).toBe('req_TEST');
    expect(serviceCtx.now()).toEqual(NOW);
    expect(deps).toEqual({ marker: 'deps' });
  });

  it('préfère SUPABASE_URL à l’adresse publique quand elle est réglée', async () => {
    calls.env.SUPABASE_URL = 'http://supabase.interne:54321';
    await campaignLockPauseHandler.run({}, ctx);
    expect(calls.clientArgs).toEqual([
      { url: 'http://supabase.interne:54321', secretKey: 'sb_secret_factice' },
    ]);
  });
});
