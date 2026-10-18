// Les tâches planifiées lisent leur sous-ensemble minimal de variables (S16b) : sans ADMIN_PATH, APP_SIGNING_SECRET, clé publiable
// Supabase ni aucune autre variable du site, elles démarrent ; sans l'une des leurs, l'erreur la NOMME (jamais sa valeur).
// Le cas d'usage et la base sont simulés : aucun appel réseau ; les valeurs n'ont que la forme attendue (aucun vrai secret).
import type * as CoreModule from '@pubeka/core';
import { EnvError } from '@pubeka/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pubeka/db', () => ({ createServiceClient: () => ({ marque: 'service' }) }));
vi.mock('@pubeka/core', async (importOriginal) => {
  const original = await importOriginal<typeof CoreModule>();
  return {
    ...original,
    refreshExchangeRates: () => Promise.resolve({ status: 'nothing_to_do' }),
    reconcilePublications: () => Promise.resolve({ scanned: 0 }),
    createRunPublicationDeps: () => ({ marque: 'deps' }),
  };
});

const { fxRefreshHandler } = await import('./fx-refresh');
const { campaignReconcileHandler } = await import('./campaign-reconcile');

const KEY_32 = Buffer.alloc(32, 7).toString('base64');
const ctx = { now: () => new Date('2026-10-17T10:00:00Z'), runtime: 'trigger' as const };

const KEPT = [
  'NEXT_PUBLIC_APP_ENV',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'TOKEN_ENCRYPTION_KEYS',
  'TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
  'ADMIN_PATH',
  'APP_SIGNING_SECRET',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

beforeEach(() => {
  // Un environnement de tâche Trigger.dev : RIEN du site, seulement ce qui est recopié pour les tâches.
  for (const name of KEPT) vi.stubEnv(name, '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fx.refresh avec l’environnement minimal', () => {
  it('démarre avec la seule adresse et la seule clé secrète de Supabase', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_factice');
    await expect(fxRefreshHandler.run({}, ctx)).resolves.toEqual({ status: 'nothing_to_do' });
  });

  it('sans la clé secrète : EnvError qui nomme SUPABASE_SECRET_KEY', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    const error: unknown = await fxRefreshHandler.run({}, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).problems.map((p) => p.name)).toEqual(['SUPABASE_SECRET_KEY']);
  });
});

describe('campaign.reconcile avec l’environnement minimal', () => {
  function minimal(): void {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_factice');
    vi.stubEnv('TOKEN_ENCRYPTION_KEYS', JSON.stringify({ k1: KEY_32 }));
    vi.stubEnv('TOKEN_ENCRYPTION_ACTIVE_KEY_ID', 'k1');
  }

  it('démarre avec son sous-ensemble, sans ADMIN_PATH, APP_SIGNING_SECRET ni clé publiable Supabase', async () => {
    minimal();
    await expect(campaignReconcileHandler.run({}, ctx)).resolves.toEqual({ scanned: 0 });
  });

  it('sans les clés de chiffrement : EnvError qui nomme TOKEN_ENCRYPTION_KEYS, sans afficher de valeur', async () => {
    minimal();
    vi.stubEnv('TOKEN_ENCRYPTION_KEYS', '');
    const error: unknown = await campaignReconcileHandler.run({}, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).problems.map((p) => p.name)).toContain('TOKEN_ENCRYPTION_KEYS');
    expect((error as EnvError).message).not.toContain('sb_secret_factice');
  });
});
