// Affichage progressif (TR-PRF-05) : flux d'OpenRouter lu sans appel réel, fausse passerelle par fragments, et règle
// « le nouvel essai n'est pas diffusé » de runAgent. Documentation : https://openrouter.ai/docs/api-reference/streaming
import { describe, expect, it } from 'vitest';
import { demoAgent, VALID_OUTPUT } from './agent.test-helper';
import { FakeAiGateway } from './fake-ai-gateway';
import { OpenRouterGateway } from './openrouter-gateway';
import { runAgent } from './run-agent';
import { AiGatewayError, type AiCompletionRequest } from './types';

const REQUEST: AiCompletionRequest = {
  model: 'google/gemma-4-31b-it:free',
  messages: [{ role: 'user', content: 'Bonjour' }],
  temperature: 0.2,
  responseFormat: { type: 'json_object' },
};

function sse(lines: string[], splitAt: number[] = []): Response {
  const text = lines.join('\n') + '\n';
  const encoder = new TextEncoder();
  const cuts = [0, ...splitAt, text.length];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < cuts.length - 1; i += 1) {
        controller.enqueue(encoder.encode(text.slice(cuts[i], cuts[i + 1])));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const data = (obj: unknown) => `data: ${JSON.stringify(obj)}`;
const delta = (content: string) => data({ model: 'openai/m', choices: [{ delta: { content } }] });

function gateway(response: () => Response, bodies: Record<string, unknown>[] = []) {
  const fetchImpl: typeof fetch = (_url, init) => {
    bodies.push(
      JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>,
    );
    return Promise.resolve(response());
  };
  return new OpenRouterGateway({ apiKey: 'cle-de-test', fetchImpl });
}

describe('OpenRouterGateway en flux', () => {
  it('demande stream: true, transmet chaque fragment, rend le texte complet, l’usage et le coût', async () => {
    const bodies: Record<string, unknown>[] = [];
    const parts: string[] = [];
    const gw = gateway(
      () =>
        sse([
          ': OPENROUTER PROCESSING',
          '',
          delta('{"a":'),
          delta('1}'),
          data({ choices: [{ delta: { content: '' }, finish_reason: 'stop' }] }),
          data({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0002 } }),
          'data: [DONE]',
        ]),
      bodies,
    );
    const done = await gw.complete({ ...REQUEST, onText: (d) => parts.push(d) });
    expect(bodies[0]?.stream).toBe(true);
    expect(parts).toEqual(['{"a":', '1}']);
    expect(done).toMatchObject({
      text: '{"a":1}',
      model: 'openai/m',
      tokensIn: 10,
      tokensOut: 4,
      costUsd: 0.0002,
      finishReason: 'stop',
    });
  });

  it('sans onText : pas de flux demandé', async () => {
    const bodies: Record<string, unknown>[] = [];
    const gw = gateway(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
          status: 200,
        }),
      bodies,
    );
    await gw.complete(REQUEST);
    expect(bodies[0]).not.toHaveProperty('stream');
  });

  it('un fragment coupé en deux paquets réseau est recomposé', async () => {
    const lines = [delta('{"x"'), delta(':2}'), 'data: [DONE]'];
    const whole = lines.join('\n') + '\n';
    for (const cut of [5, 20, 40, whole.indexOf('[DONE]') + 2]) {
      const parts: string[] = [];
      const gw = gateway(() => sse(lines, [cut]));
      const done = await gw.complete({ ...REQUEST, onText: (d) => parts.push(d) });
      expect(done.text, `coupure à ${String(cut)}`).toBe('{"x":2}');
    }
  });

  it('fin de flux sans [DONE] : le texte reçu est rendu', async () => {
    const gw = gateway(() => sse([delta('{"z":1}')]));
    expect((await gw.complete({ ...REQUEST, onText: () => undefined })).text).toBe('{"z":1}');
  });

  it('erreur au milieu du flux (statut 200 + champ error) : unavailable', async () => {
    const gw = gateway(() =>
      sse([delta('{"a"'), data({ error: { code: 502, message: 'Fournisseur en panne' } })]),
    );
    await expect(gw.complete({ ...REQUEST, onText: () => undefined })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('erreur dans le choix, ou finish_reason error : unavailable', async () => {
    const a = gateway(() => sse([data({ choices: [{ error: { message: 'boom' } }] })]));
    await expect(a.complete({ ...REQUEST, onText: () => undefined })).rejects.toMatchObject({
      kind: 'unavailable',
    });
    const b = gateway(() =>
      sse([delta('x'), data({ choices: [{ delta: {}, finish_reason: 'error' }] })]),
    );
    await expect(b.complete({ ...REQUEST, onText: () => undefined })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('flux vide : bad_response ; fragment illisible ou inattendu : bad_response', async () => {
    for (const lines of [[': ping', 'data: [DONE]'], ['data: pas du json'], ['data: 12']]) {
      const gw = gateway(() => sse(lines));
      await expect(gw.complete({ ...REQUEST, onText: () => undefined })).rejects.toMatchObject({
        kind: 'bad_response',
      });
    }
  });

  it('erreur HTTP avant le flux : traduite comme sans flux (429 → rate_limited)', async () => {
    const gw = gateway(
      () =>
        new Response(JSON.stringify({ error: { code: 429, message: 'limite' } }), { status: 429 }),
    );
    await expect(gw.complete({ ...REQUEST, onText: () => undefined })).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });

  it('annulation par le signal : timeout (« Appel annulé »)', async () => {
    const controller = new AbortController();
    const fetchImpl: typeof fetch = (_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              init?.signal?.addEventListener('abort', () => {
                c.error(new DOMException('abort', 'AbortError'));
              });
            },
          }),
          { status: 200 },
        ),
      );
    const gw = new OpenRouterGateway({ apiKey: 'cle-de-test', fetchImpl });
    const pending = gw.complete({ ...REQUEST, onText: () => undefined, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'timeout', message: 'Appel annulé' });
  });

  it('flux coupé net par le réseau : unavailable', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.error(new Error('reset'));
            },
          }),
          { status: 200 },
        ),
      );
    const gw = new OpenRouterGateway({ apiKey: 'cle-de-test', fetchImpl });
    await expect(gw.complete({ ...REQUEST, onText: () => undefined })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
});

describe('FakeAiGateway en flux', () => {
  it('sert le texte par fragments de la taille demandée, et rend le texte complet', async () => {
    const fake = new FakeAiGateway({ chunkSize: 4 }).enqueue({ text: 'abcdefghij' });
    const parts: string[] = [];
    const done = await fake.complete({ ...REQUEST, onText: (d) => parts.push(d) });
    expect(parts).toEqual(['abcd', 'efgh', 'ij']);
    expect(done.text).toBe('abcdefghij');
  });
  it('sans onText : aucun fragment', async () => {
    const fake = new FakeAiGateway().enqueue({ text: 'abc' });
    expect((await fake.complete(REQUEST)).text).toBe('abc');
  });
  it('respecte la pause entre fragments et l’annulation', async () => {
    const controller = new AbortController();
    const fake = new FakeAiGateway({ chunkSize: 2, chunkDelayMs: 20 }).enqueue({
      text: 'abcdefgh',
    });
    const parts: string[] = [];
    const pending = fake.complete({
      ...REQUEST,
      signal: controller.signal,
      onText: (d) => {
        parts.push(d);
        if (parts.length === 2) controller.abort();
      },
    });
    await expect(pending).rejects.toBeInstanceOf(AiGatewayError);
    expect(parts.length).toBeLessThan(4);
  });
  it('annulé avant le premier fragment : aucune écriture', async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = new FakeAiGateway().enqueue({ text: 'abc' });
    const parts: string[] = [];
    await expect(
      fake.complete({ ...REQUEST, signal: controller.signal, onText: (d) => parts.push(d) }),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(parts).toEqual([]);
  });
  it('annulé juste après le dernier fragment : annulation signalée', async () => {
    const controller = new AbortController();
    const fake = new FakeAiGateway({ chunkSize: 100 }).enqueue({ text: 'abc' });
    await expect(
      fake.complete({
        ...REQUEST,
        signal: controller.signal,
        onText: () => {
          controller.abort();
        },
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('fixture dynamique calculée depuis la requête, prioritaire sur la fixture fixe', async () => {
    const fake = new FakeAiGateway({
      fixtures: { analyste: { v: 'fixe' } },
      dynamicFixtures: { analyste: (r) => ({ v: r.model }) },
    });
    const done = await fake.complete({
      ...REQUEST,
      trace: { agent: 'analyste', promptVersion: 'analyste@2' },
    });
    expect(JSON.parse(done.text)).toEqual({ v: REQUEST.model });
  });
});

describe('runAgent en flux', () => {
  it('diffuse le premier appel seulement : le nouvel essai n’est pas diffusé', async () => {
    const fake = new FakeAiGateway({ chunkSize: 5 }).enqueue(
      { text: '{"label":"zzz"}' },
      { json: VALID_OUTPUT },
    );
    const parts: string[] = [];
    const { run } = await runAgent(
      demoAgent(),
      { text: 'x' },
      {
        workspaceId: null,
        gateway: fake,
        onText: (d) => parts.push(d),
      },
    );
    expect(run.retried).toBe(true);
    expect(fake.calls).toHaveLength(2);
    expect(parts.join('')).toBe('{"label":"zzz"}');
    expect(fake.calls[0]?.onText).toBeDefined();
    expect(fake.calls[1]?.onText).toBeUndefined();
  });
});
