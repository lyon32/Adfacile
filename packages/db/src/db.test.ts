// Tests unitaires de packages/db : clients, traduction des erreurs, appels aux fonctions SQL.
// Aucune vraie base : un faux client enregistre les appels (TESTING §6). Le SQL lui-même est
// testé sur PGlite (supabase/tests/*.test.mjs).
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { createServiceClient, createUserClient, type DbClient, type ServiceClient } from './client';
import { consumeCredits, creditBalances, releaseCredits, reserveCredits } from './credits';
import { check, toAppError, unwrap } from './errors';
import { hitRateLimit } from './rate-limit';
import { analysesRepo, workspacesRepo } from './repos';
import { recordWebhookEvent } from './webhook-events';

interface Res {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/** Faux client : `rpc` et `from(...).select().eq()...` renvoient `res` et notent les appels. */
function fake(res: Res) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) {
    builder[m] = (...a: unknown[]) => {
      calls.push([m, ...a]);
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve(res);
  builder.then = (ok: (v: Res) => unknown) => Promise.resolve(res).then(ok);
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push(['rpc', fn, args]);
      return Promise.resolve(res);
    },
    from: (t: string) => {
      calls.push(['from', t]);
      return builder;
    },
  };
  // Faux objet de test : seule la surface utilisée par le module est simulée.
  return { calls, svc: client as unknown as ServiceClient, db: client as unknown as DbClient };
}

const ok = (data: unknown): Res => ({ data, error: null });
const ko = (code: string): Res => ({ data: null, error: { code, message: 'x' } });

describe('clients', () => {
  it('client utilisateur : refuse une clé secrète (jamais côté client)', () => {
    expect(() =>
      createUserClient({ url: 'http://127.0.0.1:54321', publishableKey: 'sb_secret_x' }),
    ).toThrow(/publiable/);
  });
  it('client utilisateur : accepte une clé publiable, avec ou sans jeton', () => {
    expect(
      createUserClient({ url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_x' }),
    ).toBeDefined();
    expect(
      createUserClient({
        url: 'http://127.0.0.1:54321',
        publishableKey: 'sb_publishable_x',
        accessToken: 't',
      }),
    ).toBeDefined();
  });
  it('client service : refuse une clé publiable', () => {
    expect(() =>
      createServiceClient({ url: 'http://127.0.0.1:54321', secretKey: 'sb_publishable_x' }),
    ).toThrow(/secrète/);
  });
  it('client service : marqué comme tel', () => {
    expect(
      createServiceClient({ url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_x' }).__service,
    ).toBe(true);
  });
  it('client service : interdit dans le navigateur', () => {
    const g = globalThis as { window?: unknown };
    g.window = {};
    try {
      expect(() =>
        createServiceClient({ url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_x' }),
      ).toThrow(/navigateur/);
    } finally {
      delete g.window;
    }
  });
});

describe('erreurs', () => {
  it.each([
    ['P0002', 'not_found'],
    ['42501', 'forbidden'],
    ['22023', 'validation_failed'],
    ['23514', 'validation_failed'],
    ['23505', 'conflict'],
    ['XX000', 'internal_error'],
  ])('SQLSTATE %s → %s', (code, expected) => {
    expect(toAppError({ code, message: 'x' }).code).toBe(expected);
  });
  it('sans code → internal_error', () => {
    expect(toAppError({ message: 'x' }).code).toBe('internal_error');
  });
  it('unwrap renvoie les données ou lève une AppError', () => {
    expect(unwrap({ data: 3, error: null })).toBe(3);
    expect(() => unwrap({ data: null, error: { code: 'P0002', message: 'x' } })).toThrow(AppError);
    expect(() => {
      check({ error: { code: '42501', message: 'x' } });
    }).toThrow(AppError);
    expect(() => {
      check({ error: null });
    }).not.toThrow();
  });
});

describe('crédits (LLD §6.5)', () => {
  it('réservation : passe les arguments à la fonction SQL', async () => {
    const f = fake(ok(true));
    expect(await reserveCredits(f.svc, 'ws', 3, 'job')).toBe(true);
    expect(f.calls[0]).toEqual(['rpc', 'reserve_credits', { ws: 'ws', needed: 3, job: 'job' }]);
  });
  it('EC-CRED-03 : libération partielle transmet le montant', async () => {
    const f = fake(ok(1));
    expect(await releaseCredits(f.svc, 'job', 1)).toBe(1);
    expect(f.calls[0]).toEqual(['rpc', 'release_credits', { job: 'job', amount: 1 }]);
  });
  it('libération totale : pas de montant', async () => {
    const f = fake(ok(3));
    await releaseCredits(f.svc, 'job');
    expect(f.calls[0]).toEqual(['rpc', 'release_credits', { job: 'job' }]);
  });
  it('libération supérieure à la réservation → validation_failed', async () => {
    await expect(releaseCredits(fake(ko('22023')).svc, 'job', 9)).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });
  it('consommation', async () => {
    const f = fake(ok(null));
    await consumeCredits(f.svc, 'job');
    expect(f.calls[0]).toEqual(['rpc', 'consume_credits', { job: 'job' }]);
  });
  it('soldes par compartiment, filtrés par espace', async () => {
    const f = fake(
      ok([
        { bucket: 'monthly', balance: 8 },
        { bucket: 'purchased', balance: 5 },
        { bucket: null, balance: null },
      ]),
    );
    expect(await creditBalances(f.db, 'ws')).toEqual({
      monthly: 8,
      bonus: 0,
      purchased: 5,
      total: 13,
    });
    expect(f.calls).toContainEqual(['eq', 'workspace_id', 'ws']);
  });
});

describe('limites, webhooks, dépôts', () => {
  it('E7 : résultat de la limite de débit', async () => {
    const f = fake(ok([{ allowed: false, hits: 4, retry_after_s: 12 }]));
    expect(await hitRateLimit(f.svc, 'k', 3, 60)).toEqual({
      allowed: false,
      hits: 4,
      retryAfterS: 12,
    });
  });
  it('E7 : réponse vide → internal_error', async () => {
    await expect(hitRateLimit(fake(ok([])).svc, 'k', 3, 60)).rejects.toMatchObject({
      code: 'internal_error',
    });
  });
  it('E3 : rejeu de webhook', async () => {
    const f = fake(ok(false));
    expect(await recordWebhookEvent(f.svc, 'saspay', 'evt')).toBe(false);
    expect(f.calls[0]).toEqual([
      'rpc',
      'record_webhook_event',
      { p_provider: 'saspay', p_event_id: 'evt' },
    ]);
  });
  it('E8 : transfert de propriété ; non-propriétaire → forbidden', async () => {
    const f = fake(ok(null));
    await workspacesRepo.transferOwnership(f.svc, {
      workspaceId: 'w',
      newOwnerId: 'n',
      actorId: 'a',
    });
    expect(f.calls[0]).toEqual([
      'rpc',
      'transfer_ownership',
      { ws: 'w', new_owner: 'n', actor: 'a' },
    ]);
    await expect(
      workspacesRepo.transferOwnership(fake(ko('42501')).svc, {
        workspaceId: 'w',
        newOwnerId: 'n',
        actorId: 'a',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('espace : trouvé, ou not_found', async () => {
    expect(await workspacesRepo.byId(fake(ok({ id: 'w' })).db, 'w')).toEqual({ id: 'w' });
    await expect(workspacesRepo.byId(fake(ok(null)).db, 'w')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
  it('E1 : analyse filtrée par espace ; autre espace → not_found', async () => {
    const f = fake(ok({ id: 'a' }));
    expect(await analysesRepo.byId(f.db, 'ws', 'a')).toEqual({ id: 'a' });
    expect(f.calls).toContainEqual(['eq', 'workspace_id', 'ws']);
    await expect(analysesRepo.byId(fake(ok(null)).db, 'autre', 'a')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
