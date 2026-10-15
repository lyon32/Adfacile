// Aucun appel réel : `fetch` est remplacé par une fausse réponse HTTP (TESTING §1, règle 3).
import { describe, expect, it } from 'vitest';
import { omit } from './agent.test-helper';
import { OpenRouterGateway } from './openrouter-gateway';
import { AiGatewayError, type AiCompletionRequest } from './types';

const REQUEST: AiCompletionRequest = {
  model: 'google/gemma-4-31b-it:free',
  fallbackModel: 'google/gemma-4-26b-a4b-it:free',
  messages: [
    { role: 'system', content: 'Réponds par un JSON.' },
    { role: 'user', content: 'Bonjour' },
  ],
  temperature: 0.2,
  responseFormat: { type: 'json_object' },
};

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(reply: () => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  sent: Sent[];
} {
  const sent: Sent[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const bodyText = typeof init?.body === 'string' ? init.body : '{}';
    const parsed: unknown = JSON.parse(bodyText);
    sent.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body:
        typeof parsed === 'object' && parsed !== null
          ? Object.fromEntries(Object.entries(parsed))
          : {},
    });
    return await reply();
  };
  return { fetchImpl, sent };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const OK_BODY = {
  id: 'gen-1',
  model: 'google/gemma-4-26b-a4b-it:free',
  choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0004 },
};

async function failureOf(promise: Promise<unknown>): Promise<AiGatewayError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AiGatewayError) return error;
    throw error;
  }
  throw new Error('la passerelle aurait dû échouer');
}

describe('OpenRouterGateway : requête', () => {
  it('envoie UNE requête vers /chat/completions avec la clé, le modèle et son secours', async () => {
    const { fetchImpl, sent } = fakeFetch(() => json(OK_BODY));
    const gateway = new OpenRouterGateway({ apiKey: 'cle-factice', fetchImpl });
    const result = await gateway.complete(REQUEST);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(sent[0]?.headers.authorization).toBe('Bearer cle-factice');
    expect(sent[0]?.body.models).toEqual([REQUEST.model, REQUEST.fallbackModel]);
    expect(sent[0]?.body).not.toHaveProperty('model');
    expect(sent[0]?.body.temperature).toBe(0.2);
    expect(sent[0]?.body.response_format).toEqual({ type: 'json_object' });
    expect(sent[0]?.body).not.toHaveProperty('provider');
    expect(result).toEqual({
      text: '{"ok":true}',
      model: 'google/gemma-4-26b-a4b-it:free',
      tokensIn: 120,
      tokensOut: 30,
      costUsd: 0.0004,
      finishReason: 'stop',
    });
  });

  it('sans modèle de secours : un champ `model`, pas de `models`', async () => {
    const { fetchImpl, sent } = fakeFetch(() => json(OK_BODY));
    const single = omit(REQUEST, 'fallbackModel');
    await new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete({
      ...single,
      maxOutputTokens: 800,
    });
    expect(sent[0]?.body.model).toBe(REQUEST.model);
    expect(sent[0]?.body).not.toHaveProperty('models');
    expect(sent[0]?.body.max_tokens).toBe(800);
  });

  it('transmet le réglage de confidentialité choisi (data_collection)', async () => {
    const { fetchImpl, sent } = fakeFetch(() => json(OK_BODY));
    await new OpenRouterGateway({ apiKey: 'k', fetchImpl, dataCollection: 'deny' }).complete(
      REQUEST,
    );
    expect(sent[0]?.body.provider).toEqual({ data_collection: 'deny' });
  });

  it('sortie structurée : schéma strict et fournisseurs compatibles seulement (require_parameters)', async () => {
    const { fetchImpl, sent } = fakeFetch(() => json(OK_BODY));
    await new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete({
      ...REQUEST,
      responseFormat: { type: 'json_schema', name: 'analyste_output', schema: { type: 'object' } },
    });
    expect(sent[0]?.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'analyste_output', strict: true, schema: { type: 'object' } },
    });
    expect(sent[0]?.body.provider).toEqual({ require_parameters: true });
  });

  it("n'envoie jamais le champ `trace` au fournisseur", async () => {
    const { fetchImpl, sent } = fakeFetch(() => json(OK_BODY));
    await new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete({
      ...REQUEST,
      trace: { agent: 'analyste', promptVersion: 'analyste@2' },
    });
    expect(JSON.stringify(sent[0]?.body)).not.toContain('analyste@2');
  });
});

describe('OpenRouterGateway : réponse', () => {
  it('le coût et les jetons sont nuls quand le fournisseur ne les donne pas ; le modèle demandé fait foi', async () => {
    const { fetchImpl } = fakeFetch(() => json({ choices: [{ message: { content: '{"a":1}' } }] }));
    const result = await new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST);
    expect(result).toMatchObject({
      model: REQUEST.model,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      finishReason: null,
    });
  });

  it.each([
    ['une réponse illisible', () => new Response('<html>oups</html>', { status: 200 })],
    ['un corps sans choix', () => json({ choices: [] })],
    ['un contenu vide', () => json({ choices: [{ message: { content: '  ' } }] })],
    ['un contenu absent', () => json({ choices: [{ message: { content: null } }] })],
  ])('%s est une réponse invalide', async (_name, reply) => {
    const { fetchImpl } = fakeFetch(reply);
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.kind).toBe('bad_response');
  });

  it('une erreur survenue pendant la génération (statut 200) est signalée comme panne', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({
        choices: [
          { error: { message: 'Le fournisseur a coupé la réponse' }, message: { content: '' } },
        ],
      }),
    );
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toContain('coupé');
  });
});

describe('OpenRouterGateway : erreurs HTTP, jamais relancées', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [402, 'insufficient_credits'],
    [408, 'timeout'],
    [429, 'rate_limited'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [400, 'bad_request'],
  ])('statut %i : %s, après une seule requête', async (status, kind) => {
    const { fetchImpl, sent } = fakeFetch(() =>
      json({ error: { code: status, message: 'détail du fournisseur' } }, status),
    );
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.kind).toBe(kind);
    expect(failure.opts.status).toBe(status);
    expect(sent).toHaveLength(1);
  });

  it('lit le délai conseillé (Retry-After) sur un 429', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ error: { code: 429, message: 'limite' } }, 429, { 'Retry-After': '42' }),
    );
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.opts.retryAfterS).toBe(42);
  });

  it("un corps d'erreur illisible donne un message générique, sans corps brut", async () => {
    const { fetchImpl } = fakeFetch(
      () => new Response('<html>erreur serveur</html>', { status: 500 }),
    );
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toBe('Erreur 500');
  });

  it("coupe un message d'erreur trop long", async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: { message: 'x'.repeat(1_000) } }, 500));
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.message.length).toBeLessThanOrEqual(201);
  });

  it('ne divulgue jamais la clé dans une erreur', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: { message: 'No auth' } }, 401));
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'sk-or-tres-secrete', fetchImpl }).complete(REQUEST),
    );
    expect(JSON.stringify([failure.message, failure.opts])).not.toContain('tres-secrete');
  });

  it('un réseau coupé est une panne, sans relance', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = () => {
      calls += 1;
      return Promise.reject(new TypeError('fetch failed'));
    };
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete(REQUEST),
    );
    expect(failure.kind).toBe('unavailable');
    expect(calls).toBe(1);
  });

  it('un délai dépassé est un « timeout », sans relance', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = (_input, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    };
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl, timeoutMs: 20 }).complete(REQUEST),
    );
    expect(failure.kind).toBe('timeout');
    expect(calls).toBe(1);
  });

  it("un appel annulé par l'appelant est signalé", async () => {
    const controller = new AbortController();
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
        controller.abort();
      });
    const failure = await failureOf(
      new OpenRouterGateway({ apiKey: 'k', fetchImpl }).complete({
        ...REQUEST,
        signal: controller.signal,
      }),
    );
    expect(failure.kind).toBe('timeout');
    expect(failure.message).toBe('Appel annulé');
  });

  it('accepte une autre adresse de base (sans barre finale)', async () => {
    const { fetchImpl, sent } = fakeFetch(() => json(OK_BODY));
    await new OpenRouterGateway({
      apiKey: 'k',
      fetchImpl,
      baseUrl: 'http://127.0.0.1:9/v1///',
    }).complete(REQUEST);
    expect(sent[0]?.url).toBe('http://127.0.0.1:9/v1/chat/completions');
  });
});
