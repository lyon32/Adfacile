import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import { omit } from './agent.test-helper';
import { createAiGateway, usesFakeAi } from './create-gateway';
import { FakeAiGateway } from './fake-ai-gateway';
import { OpenRouterGateway } from './openrouter-gateway';
import { AiGatewayError, type AiCompletionRequest } from './types';

const REQUEST: AiCompletionRequest = {
  model: 'test/modele',
  messages: [{ role: 'user', content: 'Bonjour le monde' }],
  temperature: 0.2,
  responseFormat: { type: 'json_object' },
  trace: { agent: 'moderateur', promptVersion: 'moderateur@2' },
};

describe('FakeAiGateway (TESTING §6.1)', () => {
  it('sert les réponses programmées dans l’ordre, puis la fixture de l’agent', async () => {
    const gateway = new FakeAiGateway({ fixtures: { moderateur: { can_fix: true } } }).enqueue(
      { json: { first: 1 } },
      { text: 'JSON cassé {' },
    );
    expect((await gateway.complete(REQUEST)).text).toBe('{"first":1}');
    expect((await gateway.complete(REQUEST)).text).toBe('JSON cassé {');
    expect((await gateway.complete(REQUEST)).text).toBe('{"can_fix":true}');
    expect(gateway.calls).toHaveLength(3);
    expect(gateway.pending).toBe(0);
  });

  it('simule une panne choisie', async () => {
    const gateway = new FakeAiGateway().enqueue({ fail: 'rate_limited' });
    await expect(gateway.complete(REQUEST)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('refuse un appel imprévu au lieu d’inventer une réponse', async () => {
    await expect(new FakeAiGateway().complete(REQUEST)).rejects.toBeInstanceOf(AiGatewayError);
    await expect(
      new FakeAiGateway({ fixtures: { analyste: {} } }).complete(REQUEST),
    ).rejects.toBeInstanceOf(AiGatewayError);
  });

  it('une requête sans trace ne trouve pas de fixture', async () => {
    const untraced = omit(REQUEST, 'trace');
    await expect(
      new FakeAiGateway({ fixtures: { moderateur: {} } }).complete(untraced),
    ).rejects.toBeInstanceOf(AiGatewayError);
  });

  it('estime les jetons et ne dépense rien par défaut', async () => {
    const result = await new FakeAiGateway().enqueue({ json: { a: 1 } }).complete(REQUEST);
    expect(result.tokensIn).toBe(4);
    expect(result.tokensOut).toBe(2);
    expect(result.costUsd).toBe(0);
    expect(result.model).toBe('test/modele');
  });
});

describe('createAiGateway (ENV_SETUP §1.1 et §1.6)', () => {
  it.each([
    [undefined, false],
    ['all', true],
    ['meta,ai', true],
    ['meta, ai ,email', true],
    ['meta,saspay', false],
  ])('PUBEKA_FAKE_PROVIDERS=%s : fausse passerelle = %s', (list, fake) => {
    expect(usesFakeAi({ PUBEKA_FAKE_PROVIDERS: list })).toBe(fake);
  });

  it('prend la fausse passerelle en développement, sans clé', () => {
    expect(createAiGateway({ PUBEKA_FAKE_PROVIDERS: 'all' })).toBeInstanceOf(FakeAiGateway);
  });

  it('prend OpenRouter avec sa clé', () => {
    expect(
      createAiGateway({ OPENROUTER_API_KEY: 'cle-factice', OPENROUTER_DATA_COLLECTION: 'deny' }),
    ).toBeInstanceOf(OpenRouterGateway);
    expect(createAiGateway({ OPENROUTER_API_KEY: 'cle-factice' })).toBeInstanceOf(
      OpenRouterGateway,
    );
  });

  it('refuse de démarrer sans clé et sans fausse passerelle', () => {
    expect(() => createAiGateway({})).toThrow(AppError);
  });
});
