import { AppError } from '@pubeka/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createJobDispatcher } from './create-dispatcher';
import {
  InlineJobDispatcher,
  TriggerJobDispatcher,
  registerHandler,
  runHandler,
  type TriggerFunction,
} from './dispatcher';
import { SYSTEM_PING_TASK_ID, systemPingHandler } from './handlers/system-ping';
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from './queue-limits';

const PING_ID = '0b9d6f55-3d0c-4a56-8f0f-6c1f1c7a9e11';
const FIXED = new Date('2026-10-15T12:00:00.000Z');

function inline() {
  return new InlineJobDispatcher({
    handlers: [registerHandler(systemPingHandler)],
    now: () => FIXED,
  });
}

describe('S13 tâche d exemple en mode inline (ROADMAP S13 fait quand)', () => {
  it('exécute system.ping dans le même processus et garde son résultat', async () => {
    const dispatcher = inline();
    const res = await dispatcher.dispatch(
      SYSTEM_PING_TASK_ID,
      { pingId: PING_ID },
      { idempotencyKey: 'k1' },
    );
    expect(res).toEqual({ runId: 'inline_1', deduplicated: false });
    expect(dispatcher.results.get('inline_1')).toEqual({
      pingId: PING_ID,
      handledAt: '2026-10-15T12:00:00.000Z',
      runtime: 'inline',
    });
  });

  it('TR-JOB idempotence : la même clé ne relance pas la tâche', async () => {
    const run = vi.fn(systemPingHandler.run);
    const dispatcher = new InlineJobDispatcher({
      handlers: [registerHandler({ ...systemPingHandler, run })],
    });
    const first = await dispatcher.dispatch(
      SYSTEM_PING_TASK_ID,
      { pingId: PING_ID },
      { idempotencyKey: 'k' },
    );
    const second = await dispatcher.dispatch(
      SYSTEM_PING_TASK_ID,
      { pingId: PING_ID },
      { idempotencyKey: 'k' },
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ runId: first.runId, deduplicated: true });
    await dispatcher.dispatch(
      SYSTEM_PING_TASK_ID,
      { pingId: PING_ID },
      { idempotencyKey: 'autre' },
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('EC-META-05 : une tâche en échec n est pas rejouée avec la même clé', async () => {
    const run = vi.fn().mockRejectedValue(new Error('panne'));
    const dispatcher = new InlineJobDispatcher({
      handlers: [registerHandler({ ...systemPingHandler, run })],
    });
    const opts = { idempotencyKey: 'k' };
    await expect(
      dispatcher.dispatch(SYSTEM_PING_TASK_ID, { pingId: PING_ID }, opts),
    ).rejects.toThrow('panne');
    const again = await dispatcher.dispatch(SYSTEM_PING_TASK_ID, { pingId: PING_ID }, opts);
    expect(again.deduplicated).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('refuse une charge invalide (validation_failed) et une tâche inconnue (internal_error)', async () => {
    const dispatcher = inline();
    await expect(
      dispatcher.dispatch(
        SYSTEM_PING_TASK_ID,
        { pingId: 'pas-un-uuid', extra: 1 },
        { idempotencyKey: 'a' },
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      dispatcher.dispatch('inconnue.tache', {}, { idempotencyKey: 'b' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('runHandler rend le même résultat sous Trigger.dev (runtime trigger)', async () => {
    const out = await runHandler(
      systemPingHandler,
      { pingId: PING_ID },
      { now: () => FIXED, runtime: 'trigger' },
    );
    expect(out.runtime).toBe('trigger');
    expect(out.handledAt).toBe('2026-10-15T12:00:00.000Z');
  });
});

describe('TriggerJobDispatcher', () => {
  it('transmet la clé d idempotence à Trigger.dev et reprend l identifiant d exécution', async () => {
    const trigger = vi.fn<TriggerFunction>().mockResolvedValue({ id: 'run_abc', isCached: false });
    const res = await new TriggerJobDispatcher(trigger).dispatch(
      SYSTEM_PING_TASK_ID,
      { pingId: PING_ID },
      { idempotencyKey: 'k' },
    );
    expect(trigger).toHaveBeenCalledWith(
      SYSTEM_PING_TASK_ID,
      { pingId: PING_ID },
      { idempotencyKey: 'k' },
    );
    expect(res).toEqual({ runId: 'run_abc', deduplicated: false });
  });

  it('signale une exécution déjà connue (isCached)', async () => {
    const trigger = vi.fn<TriggerFunction>().mockResolvedValue({ id: 'run_abc', isCached: true });
    const res = await new TriggerJobDispatcher(trigger).dispatch(
      'x.y',
      {},
      { idempotencyKey: 'k' },
    );
    expect(res.deduplicated).toBe(true);
  });
});

describe('createJobDispatcher', () => {
  it('inline : fournit un InlineJobDispatcher hors production', () => {
    const d = createJobDispatcher({
      PUBEKA_JOB_DISPATCH: 'inline',
      TRIGGER_SECRET_KEY: undefined,
      NEXT_PUBLIC_APP_ENV: 'development',
    });
    expect(d).toBeInstanceOf(InlineJobDispatcher);
  });

  it('inline est refusé en production', () => {
    expect(() =>
      createJobDispatcher({
        PUBEKA_JOB_DISPATCH: 'inline',
        TRIGGER_SECRET_KEY: undefined,
        NEXT_PUBLIC_APP_ENV: 'production',
      }),
    ).toThrow(AppError);
  });

  it('trigger sans TRIGGER_SECRET_KEY est refusé', () => {
    expect(() =>
      createJobDispatcher({
        PUBEKA_JOB_DISPATCH: 'trigger',
        TRIGGER_SECRET_KEY: undefined,
        NEXT_PUBLIC_APP_ENV: 'preview',
      }),
    ).toThrow(AppError);
  });

  it('trigger avec une clé fournit un TriggerJobDispatcher (aucun appel réseau à la création)', () => {
    const d = createJobDispatcher({
      PUBEKA_JOB_DISPATCH: 'trigger',
      TRIGGER_SECRET_KEY: 'tr_dev_factice',
      NEXT_PUBLIC_APP_ENV: 'development',
    });
    expect(d).toBeInstanceOf(TriggerJobDispatcher);
  });
});

describe('files d attente (ARCHITECTURE §8.4)', () => {
  it('chaque file a une limite entière positive ; higgsfield vaut 20', () => {
    for (const name of QUEUE_NAMES) {
      expect(Number.isInteger(QUEUE_CONCURRENCY[name])).toBe(true);
      expect(QUEUE_CONCURRENCY[name]).toBeGreaterThan(0);
    }
    expect(QUEUE_CONCURRENCY['media-higgsfield']).toBe(20);
  });
});
