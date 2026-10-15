import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import { demoAgent, omit, VALID_OUTPUT } from './agent.test-helper';
import { FakeAiGateway } from './fake-ai-gateway';
import { AgentRunError, runAgent } from './run-agent';
import {
  AiGatewayError,
  type AiCompletion,
  type AiCompletionRequest,
  type AiGateway,
} from './types';

const WORKSPACE = '00000000-0000-4000-8000-000000000001';

function options(gateway: AiGateway, extra: { signal?: AbortSignal; clock?: () => number } = {}) {
  return { workspaceId: WORKSPACE, gateway, ...extra };
}

async function failureOf(promise: Promise<unknown>): Promise<AgentRunError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AgentRunError) return error;
    throw error;
  }
  throw new Error("l'agent aurait dû échouer");
}

describe('runAgent : sortie valide', () => {
  it('rend la sortie validée et un journal complet (TR-AGT-02)', async () => {
    const gateway = new FakeAiGateway({ costUsdPerCall: 0.002 }).enqueue({ json: VALID_OUTPUT });
    let t = 1_000;
    const { output, run } = await runAgent(
      demoAgent(),
      { text: 'Boutique de sacs' },
      options(gateway, { clock: () => (t += 250) }),
    );
    expect(output).toEqual(VALID_OUTPUT);
    expect(run).toMatchObject({
      workspaceId: WORKSPACE,
      agent: 'analyste',
      model: 'test/modele-principal',
      promptVersion: 'analyste@test',
      input: { text: 'Boutique de sacs' },
      output: VALID_OUTPUT,
      validSchema: true,
      retried: false,
      costUsd: 0.002,
      latencyMs: 250,
    });
    expect(run.tokensIn).toBeGreaterThan(0);
    expect(run.tokensOut).toBeGreaterThan(0);
    expect(gateway.calls).toHaveLength(1);
  });

  it('envoie le modèle, le secours et la température de la configuration, jamais ceux du code', async () => {
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    await runAgent(
      demoAgent({
        model: 'google/gemma-4-31b-it:free',
        temperature: 0.7,
        maxOutputTokens: 900,
      }),
      { text: 'x' },
      options(gateway),
    );
    const request = gateway.calls[0];
    expect(request?.model).toBe('google/gemma-4-31b-it:free');
    expect(request?.fallbackModel).toBe('test/modele-secours');
    expect(request?.temperature).toBe(0.7);
    expect(request?.maxOutputTokens).toBe(900);
    expect(request?.trace).toEqual({ agent: 'analyste', promptVersion: 'analyste@test' });
  });

  it("n'envoie pas de modèle de secours quand il n'est pas réglé", async () => {
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    const withoutFallback = omit(demoAgent(), 'fallbackModel');
    await runAgent(withoutFallback, { text: 'x' }, options(gateway));
    expect(gateway.calls[0]).not.toHaveProperty('fallbackModel');
  });

  it('accepte un bloc ```json autour de la sortie sans nouvel essai', async () => {
    const gateway = new FakeAiGateway().enqueue({
      text: '```json\n' + JSON.stringify(VALID_OUTPUT) + '\n```',
    });
    const { run } = await runAgent(demoAgent(), { text: 'x' }, options(gateway));
    expect(run.retried).toBe(false);
    expect(gateway.calls).toHaveLength(1);
  });

  it('enregistre le modèle qui a réellement répondu (modèle de secours) et un coût inconnu', async () => {
    const answered: AiGateway = {
      complete: (): Promise<AiCompletion> =>
        Promise.resolve({
          text: JSON.stringify(VALID_OUTPUT),
          model: 'test/modele-secours',
          tokensIn: 10,
          tokensOut: 5,
          costUsd: null,
          finishReason: 'stop',
        }),
    };
    const { run } = await runAgent(demoAgent(), { text: 'x' }, options(answered));
    expect(run.model).toBe('test/modele-secours');
    expect(run.costUsd).toBeNull();
    expect(run.tokensIn).toBe(10);
  });

  it("demande une sortie structurée quand l'agent la réclame", async () => {
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    await runAgent(demoAgent({ responseFormat: 'json_schema' }), { text: 'x' }, options(gateway));
    const format = gateway.calls[0]?.responseFormat;
    expect(format?.type).toBe('json_schema');
    if (format?.type === 'json_schema') {
      expect(format.name).toBe('analyste_output');
      expect(JSON.stringify(format.schema)).toContain('"label"');
      expect(format.schema).not.toHaveProperty('$schema');
    }
  });

  it('refuse une sortie structurée que Zod ne sait pas décrire en JSON Schema', async () => {
    const { z } = await import('zod');
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    const agent = demoAgent({
      responseFormat: 'json_schema',
      outputSchema: z.custom<{ label: 'a' | 'b'; reason: string }>(() => true),
    });
    await expect(runAgent(agent, { text: 'x' }, options(gateway))).rejects.toBeInstanceOf(AppError);
    expect(gateway.calls).toHaveLength(0);
  });
});

describe('TR-AGT-01 : validation, un seul nouvel essai, jamais un 3e appel', () => {
  it("TR-AGT-01 : une sortie invalide déclenche UN nouvel essai qui contient l'erreur de validation", async () => {
    const gateway = new FakeAiGateway().enqueue({ json: { label: 'z' } }, { json: VALID_OUTPUT });
    const { output, run } = await runAgent(demoAgent(), { text: 'x' }, options(gateway));
    expect(output).toEqual(VALID_OUTPUT);
    expect(run.retried).toBe(true);
    expect(run.validSchema).toBe(true);
    expect(gateway.calls).toHaveLength(2);
    const retry = gateway.calls[1]?.messages ?? [];
    expect(retry.at(-2)?.role).toBe('assistant');
    expect(retry.at(-1)?.role).toBe('user');
    expect(retry.at(-1)?.content).toContain('label');
    expect(retry.at(-1)?.content).toContain('reason');
  });

  it('TR-AGT-01 : un JSON cassé puis un JSON cassé donne un échec visible après EXACTEMENT 2 appels', async () => {
    // Trois réponses sont prêtes : un troisième appel en consommerait une et ferait échouer le test.
    const gateway = new FakeAiGateway().enqueue(
      { text: 'Bien sûr ! Voici : {oups' },
      { text: 'Désolé, encore {oups' },
      { json: VALID_OUTPUT },
    );
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(gateway)));
    expect(gateway.calls).toHaveLength(2);
    expect(gateway.pending).toBe(1);
    expect(failure.code).toBe('provider_unavailable');
    expect(failure.status).toBe(503);
    expect(failure.reason).toBe('invalid_output');
    expect(failure.run).toMatchObject({ validSchema: false, retried: true, output: null });
  });

  it('TR-AGT-01 : un schéma non respecté deux fois échoue après 2 appels, coût compris', async () => {
    const gateway = new FakeAiGateway({ costUsdPerCall: 0.001 }).enqueue(
      { json: { label: 'a' } },
      { json: { label: 'b' } },
      { json: VALID_OUTPUT },
    );
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(gateway)));
    expect(gateway.calls).toHaveLength(2);
    expect(failure.run.costUsd).toBeCloseTo(0.002, 6);
    expect(failure.run.validSchema).toBe(false);
    expect(failure.run.input).toEqual({ text: 'x' });
  });

  it("TR-AGT-01 : une panne de la passerelle n'est jamais rejouée (résultat incertain)", async () => {
    const gateway = new FakeAiGateway().enqueue({ fail: 'unavailable' }, { json: VALID_OUTPUT });
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(gateway)));
    expect(gateway.calls).toHaveLength(1);
    expect(gateway.pending).toBe(1);
    expect(failure.reason).toBe('gateway');
    expect(failure.code).toBe('provider_unavailable');
    expect(failure.run.retried).toBe(false);
  });

  it("TR-AGT-01 : une panne pendant le nouvel essai ne déclenche pas d'appel de plus", async () => {
    const gateway = new FakeAiGateway().enqueue(
      { text: 'pas du json' },
      { fail: 'timeout' },
      { json: VALID_OUTPUT },
    );
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(gateway)));
    expect(gateway.calls).toHaveLength(2);
    expect(failure.reason).toBe('gateway');
    expect(failure.run.retried).toBe(true);
  });

  it('une limite de débit est renvoyée comme telle, avec le délai conseillé, sans relance', async () => {
    const limited: AiGateway = {
      complete: (): Promise<AiCompletion> =>
        Promise.reject(
          new AiGatewayError('rate_limited', 'trop vite', { status: 429, retryAfterS: 30 }),
        ),
    };
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(limited)));
    expect(failure.code).toBe('rate_limited');
    expect(failure.status).toBe(429);
    expect(failure.opts.retryAfterS).toBe(30);
  });

  it('une erreur inattendue de la passerelle devient « fournisseur indisponible »', async () => {
    const broken: AiGateway = { complete: () => Promise.reject(new Error('boum')) };
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(broken)));
    expect(failure.code).toBe('provider_unavailable');
    expect(failure.reason).toBe('gateway');
  });

  it('un appel annulé après la première réponse invalide ne lance pas de nouvel essai', async () => {
    const controller = new AbortController();
    const calls: AiCompletionRequest[] = [];
    const gateway: AiGateway = {
      complete: (request) => {
        calls.push(request);
        controller.abort();
        return Promise.resolve({
          text: 'pas du json',
          model: request.model,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0,
          finishReason: 'stop',
        });
      },
    };
    const failure = await failureOf(
      runAgent(demoAgent(), { text: 'x' }, options(gateway, { signal: controller.signal })),
    );
    expect(calls).toHaveLength(1);
    expect(failure.reason).toBe('aborted');
  });
});

describe('runAgent : entrée et rôle', () => {
  it('refuse une entrée invalide sans appeler la passerelle', async () => {
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    const failure = await failureOf(runAgent(demoAgent(), { text: '' }, options(gateway)));
    expect(gateway.calls).toHaveLength(0);
    expect(failure.code).toBe('validation_failed');
    expect(failure.reason).toBe('invalid_input');
  });

  it('R1 : OUT_OF_SCOPE est un refus de mission, pas une erreur de forme : aucun nouvel essai', async () => {
    const gateway = new FakeAiGateway().enqueue(
      { json: { error: 'OUT_OF_SCOPE' } },
      { json: VALID_OUTPUT },
    );
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(gateway)));
    expect(gateway.calls).toHaveLength(1);
    expect(failure.reason).toBe('out_of_scope');
    expect(failure.code).toBe('validation_failed');
  });

  it('R1 : OUT_OF_SCOPE au second essai est aussi reconnu', async () => {
    const gateway = new FakeAiGateway().enqueue(
      { text: 'bavardage' },
      { json: { error: 'OUT_OF_SCOPE' } },
    );
    const failure = await failureOf(runAgent(demoAgent(), { text: 'x' }, options(gateway)));
    expect(gateway.calls).toHaveLength(2);
    expect(failure.reason).toBe('out_of_scope');
  });

  it("une erreur d'agent est une AppError de la liste fermée, sans donnée du client dans meta", async () => {
    const gateway = new FakeAiGateway();
    const failure = await failureOf(
      runAgent(demoAgent(), { text: 'secret du client' }, options(gateway)),
    );
    expect(failure).toBeInstanceOf(AppError);
    expect(failure.opts.meta).toEqual({ reason: 'gateway', agent: 'analyste' });
  });
});
