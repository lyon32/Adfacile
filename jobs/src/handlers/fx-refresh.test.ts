// Tâche `fx.refresh` (S15b) : tâche planifiée qui rafraîchit les taux de change. Aucun appel réseau réel : le cas d'usage
// et la source sont simulés; la logique est prouvée dans `@pubeka/core` (fx/refresh-exchange-rates.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineHandlers } from '../create-dispatcher';
import { InlineJobDispatcher, runHandler } from '../dispatcher';
import { FX_REFRESH_TASK, fxRefreshHandler, fxRefreshPayloadSchema } from './fx-refresh';

const refresh = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn(() => ({ marque: 'service' })));
const Source = vi.hoisted(() =>
  vi.fn(function Source(this: { marque: string }) {
    this.marque = 'source ExchangeRate-API';
  }),
);

vi.mock('@pubeka/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refreshExchangeRates: refresh,
  ExchangeRateApiSource: Source,
}));
vi.mock('@pubeka/db', () => ({ createServiceClient }));
vi.mock('@pubeka/shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnv: () => ({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'sb_secret_test' }),
}));

const NOW = new Date('2026-10-17T06:00:00.000Z');

beforeEach(() => {
  refresh.mockReset();
  refresh.mockResolvedValue({
    status: 'refreshed',
    written: ['NGN'],
    unchanged: [],
    missing: [],
    rejected: [],
  });
  Source.mockClear();
});

describe('fx.refresh', () => {
  it('identifiant stable et charge vide : aucun champ n’est accepté (aucune clé, aucun secret)', () => {
    expect(FX_REFRESH_TASK).toBe('fx.refresh');
    expect(fxRefreshPayloadSchema.safeParse({}).success).toBe(true);
    expect(fxRefreshPayloadSchema.safeParse({ app_id: 'x' }).success).toBe(false);
  });

  it('appelle le cas d’usage avec le client service, la source ExchangeRate-API et l’horloge du contexte', async () => {
    const result = await runHandler(fxRefreshHandler, {}, { now: () => NOW, runtime: 'trigger' });
    expect(result).toMatchObject({ status: 'refreshed', written: ['NGN'] });
    expect(refresh).toHaveBeenCalledTimes(1);
    const [deps] = refresh.mock.calls[0] as [
      { svc: unknown; source: { marque: string }; now: () => Date },
    ];
    expect(deps.svc).toEqual({ marque: 'service' });
    expect(deps.source.marque).toBe('source ExchangeRate-API');
    expect(deps.now()).toEqual(NOW);
    expect(createServiceClient).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:54321',
      secretKey: 'sb_secret_test',
    });
  });

  it('un échec de la source (rapporté, pas levé) ne fait pas échouer la tâche : elle ne se relance jamais d’elle-même', async () => {
    refresh.mockResolvedValue({
      status: 'failed',
      error: 'rate_limited',
      written: [],
      unchanged: [],
      missing: [],
      rejected: [],
    });
    const result = await runHandler(fxRefreshHandler, {}, { now: () => NOW, runtime: 'trigger' });
    expect(result).toMatchObject({ status: 'failed', error: 'rate_limited' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('une erreur de base (levée) remonte : la tâche échoue visiblement, sans nouvel essai', async () => {
    refresh.mockRejectedValue(new Error('base indisponible'));
    await expect(
      runHandler(fxRefreshHandler, {}, { now: () => NOW, runtime: 'trigger' }),
    ).rejects.toThrow('base indisponible');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('mode inline : enregistrée, et la même clé d’idempotence ne relance pas la tâche', async () => {
    expect(inlineHandlers.map((h) => h.id)).toContain(FX_REFRESH_TASK);
    const dispatcher = new InlineJobDispatcher({ handlers: inlineHandlers, now: () => NOW });
    await dispatcher.dispatch(FX_REFRESH_TASK, {}, { idempotencyKey: 'fx:2026-10-17T06' });
    const again = await dispatcher.dispatch(
      FX_REFRESH_TASK,
      {},
      { idempotencyKey: 'fx:2026-10-17T06' },
    );
    expect(again.deduplicated).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
