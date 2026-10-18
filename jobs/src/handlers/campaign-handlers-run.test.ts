// Exécution des gestionnaires `campaign.publish` et `campaign.reconcile` : ils construisent le client de service (adresse
// `SUPABASE_URL`, sinon l'adresse publique), les dépendances (jamais un jeton dans la charge) et appellent le cas d'usage.
// Cas d'usage, base et environnement sont simulés : aucun appel réseau, aucun vrai service.
import type * as CoreModule from '@pubeka/core';
import type * as DbModule from '@pubeka/db';
import type * as SharedModule from '@pubeka/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => {
  const env: Record<string, string | undefined> = {};
  return {
    clientArgs: [] as unknown[],
    runArgs: [] as unknown[],
    reconcileArgs: [] as unknown[],
    depsArgs: [] as unknown[],
    env,
  };
});

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
    createRunPublicationDeps: (...args: unknown[]) => {
      calls.depsArgs.push(args);
      return { marker: 'deps' };
    },
    runPublication: (...args: unknown[]) => {
      calls.runArgs.push(args);
      return Promise.resolve({ outcome: 'skipped', reason: 'done' });
    },
    reconcilePublications: (...args: unknown[]) => {
      calls.reconcileArgs.push(args);
      return Promise.resolve({ scanned: 0 });
    },
  };
});

const { campaignPublishHandler } = await import('./campaign-publish');
const { campaignReconcileHandler } = await import('./campaign-reconcile');

const NOW = new Date('2026-10-17T10:00:00Z');
const ctx = { now: () => NOW, runtime: 'inline' as const };
const CAMPAIGN = '5f0c2f56-6a3a-4a7e-8c4f-0a8e0f0a1b2c';
const WORKSPACE = '9d8c7b6a-5f4e-4d3c-8b2a-1a0f9e8d7c6b';

beforeEach(() => {
  calls.clientArgs.length = 0;
  calls.runArgs.length = 0;
  calls.reconcileArgs.length = 0;
  calls.depsArgs.length = 0;
  for (const key of Object.keys(calls.env)) Reflect.deleteProperty(calls.env, key);
  calls.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  calls.env.SUPABASE_SECRET_KEY = 'sb_secret_factice';
});

describe('campaign.publish — exécution', () => {
  it('rejoue runPublication avec le client de service, les dépendances de l’environnement et les seuls identifiants', async () => {
    const result = await campaignPublishHandler.run(
      { campaignId: CAMPAIGN, workspaceId: WORKSPACE },
      ctx,
    );
    expect(result).toEqual({ outcome: 'skipped', reason: 'done' });
    expect(calls.clientArgs).toEqual([
      { url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_factice' },
    ]);
    expect(calls.runArgs).toHaveLength(1);
    const [serviceCtx, payload] = calls.runArgs[0] as [{ requestId: string }, unknown];
    expect(serviceCtx.requestId).toBe('req_TEST');
    expect(payload).toEqual({ campaignId: CAMPAIGN, workspaceId: WORKSPACE });
    expect(calls.depsArgs).toHaveLength(1);
  });

  it('préfère SUPABASE_URL à l’adresse publique quand elle est réglée', async () => {
    calls.env.SUPABASE_URL = 'http://supabase.interne:54321';
    await campaignPublishHandler.run({ campaignId: CAMPAIGN, workspaceId: WORKSPACE }, ctx);
    expect(calls.clientArgs).toEqual([
      { url: 'http://supabase.interne:54321', secretKey: 'sb_secret_factice' },
    ]);
  });
});

describe('campaign.reconcile — exécution', () => {
  it('lance une passe de reprise avec le client de service et les dépendances de l’environnement', async () => {
    const result = await campaignReconcileHandler.run({}, ctx);
    expect(result).toEqual({ scanned: 0 });
    expect(calls.clientArgs).toEqual([
      { url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_factice' },
    ]);
    expect(calls.reconcileArgs).toHaveLength(1);
    const [serviceCtx, deps] = calls.reconcileArgs[0] as [
      { requestId: string; now: () => Date },
      unknown,
    ];
    expect(serviceCtx.requestId).toBe('req_TEST');
    expect(serviceCtx.now()).toEqual(NOW);
    expect(deps).toEqual({ marker: 'deps' });
  });

  it('préfère SUPABASE_URL à l’adresse publique quand elle est réglée', async () => {
    calls.env.SUPABASE_URL = 'http://supabase.interne:54321';
    await campaignReconcileHandler.run({}, ctx);
    expect(calls.clientArgs).toEqual([
      { url: 'http://supabase.interne:54321', secretKey: 'sb_secret_factice' },
    ]);
  });
});
