// Tâche `analysis.run` : charge stricte (identifiants seulement), même gestionnaire en `inline` et sous Trigger.dev,
// clé d'idempotence. La logique d'analyse est prouvée dans `@pubeka/core` (tests unitaires et d'intégration).
import { AppError } from '@pubeka/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineHandlers } from '../create-dispatcher';
import { InlineJobDispatcher, runHandler } from '../dispatcher';
import { ANALYSIS_RUN_TASK, analysisRunHandler, analysisRunPayloadSchema } from './analysis-run';

const run = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn(() => ({ marque: 'service' })));

vi.mock('@pubeka/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runAnalysis: run,
  createAnalysisRunDeps: () => ({ marque: 'deps' }),
}));
vi.mock('@pubeka/db', () => ({ createServiceClient }));
vi.mock('@pubeka/shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnv: () => ({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'sb_secret_test' }),
}));

const PAYLOAD = {
  analysisId: '0b9d6f55-3d0c-4a56-8f0f-6c1f1c7a9e11',
  workspaceId: '1c0e7a66-4e1d-4b67-9a1f-7d2a2d8bafb2',
};
const NOW = new Date('2026-10-15T12:00:00.000Z');

beforeEach(() => {
  run.mockReset();
  run.mockResolvedValue({ outcome: 'questions' });
});

describe('analysis.run', () => {
  it('ne reçoit que des identifiants : un champ en plus, un identifiant mal formé ou un contenu sont refusés', () => {
    expect(analysisRunPayloadSchema.safeParse(PAYLOAD).success).toBe(true);
    expect(
      analysisRunPayloadSchema.safeParse({ ...PAYLOAD, text: 'contenu du site' }).success,
    ).toBe(false);
    expect(analysisRunPayloadSchema.safeParse({ ...PAYLOAD, analysisId: 'abc' }).success).toBe(
      false,
    );
    expect(analysisRunPayloadSchema.safeParse({ analysisId: PAYLOAD.analysisId }).success).toBe(
      false,
    );
  });

  it('appelle runAnalysis avec le client service, les dépendances et l’horloge du contexte', async () => {
    const result = await runHandler(analysisRunHandler, PAYLOAD, {
      now: () => NOW,
      runtime: 'trigger',
    });
    expect(result).toEqual({ outcome: 'questions' });
    expect(run).toHaveBeenCalledTimes(1);
    const [ctx, payload, deps] = run.mock.calls[0] as [
      { svc: unknown; now: () => Date; requestId: string },
      unknown,
      unknown,
    ];
    expect(ctx.svc).toEqual({ marque: 'service' });
    expect(ctx.now()).toEqual(NOW);
    expect(ctx.requestId).toMatch(/^req_/);
    expect(payload).toEqual(PAYLOAD);
    expect(deps).toEqual({ marque: 'deps' });
    expect(createServiceClient).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:54321',
      secretKey: 'sb_secret_test',
    });
  });

  it('une charge invalide est refusée avant tout accès (validation_failed), sans lancer l’analyse', async () => {
    await expect(
      runHandler(analysisRunHandler, { analysisId: 'x' }, { now: () => NOW, runtime: 'inline' }),
    ).rejects.toBeInstanceOf(AppError);
    expect(run).not.toHaveBeenCalled();
  });

  it('mode inline : le gestionnaire est enregistré, et la même clé d’idempotence ne relance pas la tâche', async () => {
    expect(inlineHandlers.map((h) => h.id)).toContain(ANALYSIS_RUN_TASK);
    const dispatcher = new InlineJobDispatcher({ handlers: inlineHandlers, now: () => NOW });
    const first = await dispatcher.dispatch(ANALYSIS_RUN_TASK, PAYLOAD, {
      idempotencyKey: `analysis:${PAYLOAD.analysisId}`,
    });
    const second = await dispatcher.dispatch(ANALYSIS_RUN_TASK, PAYLOAD, {
      idempotencyKey: `analysis:${PAYLOAD.analysisId}`,
    });
    expect(first.deduplicated).toBe(false);
    expect(second).toMatchObject({ runId: first.runId, deduplicated: true });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
