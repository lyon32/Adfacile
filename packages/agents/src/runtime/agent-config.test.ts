// Réglage par agent derrière une interface (pour S31) : source de configuration, clé propre, journal de santé.
import { describe, expect, it, vi } from 'vitest';
import { demoAgent, demoInput, VALID_OUTPUT } from './agent.test-helper';
import { FakeAiGateway } from './fake-ai-gateway';
import { EnvAgentConfigSource } from './models';
import { OpenRouterGateway } from './openrouter-gateway';
import { AgentRunError, runAgent } from './run-agent';
import {
  AiGatewayError,
  applyAgentConfig,
  type AgentConfigSource,
  type AgentKeyStore,
  type AiCompletionRequest,
} from './types';

const INPUT = demoInput.parse({ text: 'Bonjour' });
const SECRET = 'cle-propre-factice-12345';

describe('AgentConfigSource', () => {
  it('EnvAgentConfigSource : OpenRouter, modèle de models.json, surcharge par AGENT_MODELS', async () => {
    const base = await new EnvAgentConfigSource().get('stratege');
    expect(base.provider).toBe('openrouter');
    expect(base.keyRef).toBeUndefined();
    const over = await new EnvAgentConfigSource(
      JSON.stringify({ stratege: { model: 'a/b', fallback: 'c/d' } }),
    ).get('stratege');
    expect(over).toMatchObject({
      model: 'a/b',
      fallbackModel: 'c/d',
      temperature: base.temperature,
    });
  });

  it('une source en base se branche sans toucher à runAgent', async () => {
    const source: AgentConfigSource = {
      get: (agent) =>
        Promise.resolve({
          agent,
          provider: 'openrouter',
          model: 'base/modele',
          fallbackModel: 'base/secours',
          temperature: 0.1,
        }),
    };
    const def = applyAgentConfig(demoAgent(), await source.get('analyste'));
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    const { run } = await runAgent(def, INPUT, { workspaceId: null, gateway });
    expect(gateway.calls[0]).toMatchObject({ model: 'base/modele', fallbackModel: 'base/secours' });
    expect(run.requestedModel).toBe('base/modele');
  });
});

describe('journal agent_runs : de quoi calculer la santé (S31)', () => {
  it('succès : fournisseur, modèle demandé et utilisé, essais, pas d erreur', async () => {
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    const { run } = await runAgent(demoAgent(), INPUT, { workspaceId: null, gateway });
    expect(run).toMatchObject({
      provider: 'openrouter',
      requestedModel: 'test/modele-principal',
      attempts: 1,
      errorCode: null,
      validSchema: true,
    });
    expect(run.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('nouvel essai : 2 essais ; échec de schéma : code d erreur et 2 essais', async () => {
    const gateway = new FakeAiGateway().enqueue({ text: 'non' }, { text: 'non' });
    const error = await runAgent(demoAgent(), INPUT, { workspaceId: null, gateway }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AgentRunError);
    if (!(error instanceof AgentRunError)) return;
    expect(error.run).toMatchObject({
      attempts: 2,
      retried: true,
      errorCode: 'provider_unavailable',
    });
  });

  it('panne de la passerelle : 1 essai et code rate_limited', async () => {
    const gateway = new FakeAiGateway().enqueue({ fail: 'rate_limited' });
    const error = await runAgent(demoAgent(), INPUT, { workspaceId: null, gateway }).catch(
      (e: unknown) => e,
    );
    if (!(error instanceof AgentRunError)) throw new Error('AgentRunError attendue');
    expect(error.run).toMatchObject({ attempts: 1, errorCode: 'rate_limited' });
  });

  it('entrée refusée : 0 appel', async () => {
    const gateway = new FakeAiGateway();
    const error = await runAgent(demoAgent(), { text: '' }, { workspaceId: null, gateway }).catch(
      (e: unknown) => e,
    );
    if (!(error instanceof AgentRunError)) throw new Error('AgentRunError attendue');
    expect(error.run).toMatchObject({ attempts: 0, errorCode: 'validation_failed' });
    expect(gateway.calls).toHaveLength(0);
  });
});

describe('clé propre à un agent', () => {
  it('résolue par AgentKeyStore, transmise à la passerelle, jamais dans le journal', async () => {
    const resolve = vi.fn<AgentKeyStore['resolve']>().mockResolvedValue(SECRET);
    const keys: AgentKeyStore = { resolve };
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    const { run } = await runAgent(demoAgent({ keyRef: 'ref-1' }), INPUT, {
      workspaceId: null,
      gateway,
      keys,
    });
    expect(resolve).toHaveBeenCalledWith('ref-1');
    expect(gateway.calls[0]?.apiKey).toBe(SECRET);
    expect(JSON.stringify(run)).not.toContain(SECRET);
  });

  it('sans keyRef, aucune clé n est transmise (clé globale de la passerelle)', async () => {
    const gateway = new FakeAiGateway().enqueue({ json: VALID_OUTPUT });
    await runAgent(demoAgent(), INPUT, { workspaceId: null, gateway });
    expect(gateway.calls[0]).not.toHaveProperty('apiKey');
  });

  it('keyRef sans magasin de clés, ou clé introuvable : échec sans appel ni fuite', async () => {
    const gateway = new FakeAiGateway();
    const noStore = await runAgent(demoAgent({ keyRef: 'r' }), INPUT, {
      workspaceId: null,
      gateway,
    }).catch((e: unknown) => e);
    expect(noStore).toBeInstanceOf(AgentRunError);
    const failing: AgentKeyStore = { resolve: () => Promise.reject(new Error(SECRET)) };
    const lost = await runAgent(demoAgent({ keyRef: 'r' }), INPUT, {
      workspaceId: null,
      gateway,
      keys: failing,
    }).catch((e: unknown) => e);
    if (!(lost instanceof AgentRunError)) throw new Error('AgentRunError attendue');
    expect(lost.run.attempts).toBe(0);
    expect(JSON.stringify(lost.run)).not.toContain(SECRET);
    expect(lost.cause).toBeUndefined();
    expect(gateway.calls).toHaveLength(0);
  });

  it('OpenRouterGateway : la clé de l appel remplace la clé globale et n est pas dans le corps', async () => {
    let auth = '';
    let body = '';
    const fetchImpl: typeof fetch = (_input, init) => {
      auth = new Headers(init?.headers).get('authorization') ?? '';
      body = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({ model: 'm/x', choices: [{ message: { content: '{}' } }], usage: {} }),
          { status: 200 },
        ),
      );
    };
    const gateway = new OpenRouterGateway({ apiKey: 'globale', fetchImpl });
    const request: AiCompletionRequest = {
      model: 'm/x',
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0,
      responseFormat: { type: 'json_object' },
    };
    await gateway.complete({ ...request, apiKey: SECRET });
    expect(auth).toBe(`Bearer ${SECRET}`);
    expect(body).not.toContain(SECRET);
    await gateway.complete(request);
    expect(auth).toBe('Bearer globale');
  });

  it('un autre fournisseur n est pas encore réalisé : bad_request, aucun appel réseau', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = new OpenRouterGateway({ apiKey: 'k', fetchImpl });
    const error = await gateway
      .complete({
        provider: 'anthropic',
        model: 'm/x',
        messages: [{ role: 'user', content: 'x' }],
        temperature: 0,
        responseFormat: { type: 'json_object' },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiGatewayError);
    expect(error).toMatchObject({ kind: 'bad_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
