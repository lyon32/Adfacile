// Tâches `campaign.sync-status` et `campaign.sync-stats` (S17, TR-PLA-05, TR-PLA-06) : charges validées, client de service, dépendances
// de l'environnement, planifications. Cas d'usage, base et environnement simulés : aucun appel réseau, aucun vrai service.
import type * as CoreModule from '@pubeka/core';
import type * as DbModule from '@pubeka/db';
import type * as SharedModule from '@pubeka/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineJobDispatcher, runHandler } from '../dispatcher';
import { inlineHandlers } from '../create-dispatcher';
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from '../queue-limits';

const calls = vi.hoisted(() => {
  const env: Record<string, string | undefined> = {};
  return {
    env,
    clientArgs: [] as unknown[],
    statusArgs: [] as unknown[],
    statsArgs: [] as unknown[],
    depsArgs: [] as unknown[],
    explainArgs: [] as unknown[],
    rejections: 0,
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
    createSyncDeps: (...args: unknown[]) => {
      calls.depsArgs.push(args);
      return { marker: 'deps' };
    },
    createExplainDeps: () => ({ marker: 'explain-deps' }),
    explainPendingRejections: (...args: unknown[]) => {
      calls.explainArgs.push(args);
      return Promise.resolve({ explained: 1, failed: 0, skipped: 0 });
    },
    syncCampaignStatuses: (...args: unknown[]) => {
      calls.statusArgs.push(args);
      return Promise.resolve({ scanned: 0, rejections: calls.rejections });
    },
    syncCampaignStats: (...args: unknown[]) => {
      calls.statsArgs.push(args);
      return Promise.resolve({ scanned: 0 });
    },
  };
});

const {
  campaignSyncStatsHandler,
  campaignSyncStatusHandler,
  CAMPAIGN_SYNC_STATS_CRON,
  CAMPAIGN_SYNC_STATUS_CRON,
} = await import('./campaign-sync');

const NOW = new Date('2026-10-24T10:00:00Z');
const ctx = { now: () => NOW, runtime: 'inline' as const };
const CAMPAIGN = '5f0c2f56-6a3a-4a7e-8c4f-0a8e0f0a1b2c';
const WORKSPACE = '9d8c7b6a-5f4e-4d3c-8b2a-1a0f9e8d7c6b';

beforeEach(() => {
  calls.clientArgs.length = 0;
  calls.statusArgs.length = 0;
  calls.statsArgs.length = 0;
  calls.depsArgs.length = 0;
  calls.explainArgs.length = 0;
  calls.rejections = 0;
  for (const key of Object.keys(calls.env)) Reflect.deleteProperty(calls.env, key);
  calls.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  calls.env.SUPABASE_SECRET_KEY = 'sb_secret_factice';
});

describe('TR-PLA-05 — campaign.sync-status', () => {
  it('toutes les 15 minutes (filet de sécurité des webhooks)', () => {
    expect(CAMPAIGN_SYNC_STATUS_CRON).toBe('*/15 * * * *');
    expect(campaignSyncStatusHandler.id).toBe('campaign.sync-status');
  });

  it('passe complète par défaut (charge vide)', async () => {
    await campaignSyncStatusHandler.run({}, ctx);
    const [serviceCtx, deps, options] = calls.statusArgs[0] as [
      { requestId: string; now: () => Date },
      unknown,
      unknown,
    ];
    expect(serviceCtx.requestId).toBe('req_TEST');
    expect(serviceCtx.now()).toEqual(NOW);
    expect(deps).toEqual({ marker: 'deps' });
    expect(options).toEqual({ scope: 'all' });
    expect(calls.clientArgs).toEqual([
      { url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_factice' },
    ]);
  });

  it('lancée par un webhook : seulement les campagnes qui ont reçu un signal', async () => {
    await campaignSyncStatusHandler.run({ scope: 'webhook' }, ctx);
    expect((calls.statusArgs[0] as unknown[])[2]).toEqual({ scope: 'webhook' });
  });

  it('refuse une charge inconnue ou invalide avant toute exécution (jamais de données du webhook dans la charge)', async () => {
    for (const payload of [
      { scope: 'tout' },
      { campaignId: CAMPAIGN },
      { scope: 'webhook', secret: 'x' },
    ]) {
      await expect(runHandler(campaignSyncStatusHandler, payload, ctx)).rejects.toMatchObject({
        code: 'validation_failed',
      });
    }
    expect(calls.statusArgs).toHaveLength(0);
  });
});

describe('TR-PLA-06 — campaign.sync-stats', () => {
  it('toutes les heures, à la demande avec « Actualiser »', () => {
    expect(CAMPAIGN_SYNC_STATS_CRON).toBe('0 * * * *');
    expect(campaignSyncStatsHandler.id).toBe('campaign.sync-stats');
  });

  it('passe horaire : charge vide, toutes les campagnes qui diffusent', async () => {
    await campaignSyncStatsHandler.run({}, ctx);
    expect((calls.statsArgs[0] as unknown[])[2]).toEqual({});
  });

  it('à la demande : une campagne, dans son espace', async () => {
    await campaignSyncStatsHandler.run({ campaignId: CAMPAIGN, workspaceId: WORKSPACE }, ctx);
    expect((calls.statsArgs[0] as unknown[])[2]).toEqual({
      campaignId: CAMPAIGN,
      workspaceId: WORKSPACE,
    });
  });

  it('une campagne sans son espace (ou l’inverse) est refusée : jamais une campagne cherchée hors de son espace', async () => {
    for (const payload of [
      { campaignId: CAMPAIGN },
      { workspaceId: WORKSPACE },
      { campaignId: 'x', workspaceId: WORKSPACE },
    ]) {
      await expect(runHandler(campaignSyncStatsHandler, payload, ctx)).rejects.toMatchObject({
        code: 'validation_failed',
      });
    }
    expect(calls.statsArgs).toHaveLength(0);
  });

  it('préfère SUPABASE_URL à l’adresse publique quand elle est réglée', async () => {
    calls.env.SUPABASE_URL = 'http://supabase.interne:54321';
    await campaignSyncStatsHandler.run({}, ctx);
    expect(calls.clientArgs).toEqual([
      { url: 'http://supabase.interne:54321', secretKey: 'sb_secret_factice' },
    ]);
  });
});

describe('Mode inline et file', () => {
  it('les deux tâches sont lançables par le lanceur inline (webhook, bouton « Actualiser »)', async () => {
    const dispatcher = new InlineJobDispatcher({ handlers: inlineHandlers, now: () => NOW });
    const first = await dispatcher.dispatch(
      'campaign.sync-stats',
      { campaignId: CAMPAIGN, workspaceId: WORKSPACE },
      { idempotencyKey: 'a' },
    );
    expect(first.deduplicated).toBe(false);
    // Même clé d'idempotence : une seule exécution (un double clic ne copie pas deux fois).
    const again = await dispatcher.dispatch(
      'campaign.sync-stats',
      { campaignId: CAMPAIGN, workspaceId: WORKSPACE },
      { idempotencyKey: 'a' },
    );
    expect(again.deduplicated).toBe(true);
    expect(calls.statsArgs).toHaveLength(1);
    await dispatcher.dispatch(
      'campaign.sync-status',
      { scope: 'webhook' },
      { idempotencyKey: 'b' },
    );
    expect(calls.statusArgs).toHaveLength(1);
  });

  it('file `meta-sync` séparée des publications, limitée à 3 lectures simultanées', () => {
    expect(QUEUE_NAMES).toContain('meta-sync');
    expect(QUEUE_CONCURRENCY['meta-sync']).toBe(3);
    expect(QUEUE_CONCURRENCY['meta-publish']).toBe(5);
  });
});

describe('S18 — le Modérateur explique tout de suite un refus qui vient d’être enregistré', () => {
  it('sans nouveau refus, le Modérateur n’est pas appelé', async () => {
    await campaignSyncStatusHandler.run({}, ctx);
    expect(calls.explainArgs).toHaveLength(0);
  });

  it('avec un nouveau refus, une passe d’explication suit la synchronisation', async () => {
    calls.rejections = 1;
    await campaignSyncStatusHandler.run({ scope: 'webhook' }, ctx);
    expect(calls.explainArgs).toHaveLength(1);
  });
});
