// Flux SSE : déconnexion du client (annulation du flux sans casser le travail en cours), ordre et erreur au milieu.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { sseStream } from './sse';

const REQ = { path: '/p', requestId: 'req_TEST' };

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) return out;
    out += decoder.decode(part.value);
  }
}

describe('sseStream : annulation', () => {
  it('le client part : onCancel est appelé, les envois suivants sont ignorés sans erreur, le travail continue', async () => {
    let cancelled = 0;
    let finished = false;
    let sentAfterCancel: unknown = 'non appelé';
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stream = sseStream(
      async (sender) => {
        sender.send('field', { path: 'a', value: 1 });
        await gate;
        expect(sender.closed).toBe(true);
        sentAfterCancel = (() => {
          sender.send('done', { x: 1 });
          return 'sans erreur';
        })();
        finished = true;
      },
      REQ,
      undefined,
      () => {
        cancelled += 1;
      },
    );
    const reader = stream.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: field');
    await reader.cancel();
    expect(cancelled).toBe(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(finished).toBe(true);
    expect(sentAfterCancel).toBe('sans erreur');
  });

  it('une exception après l’annulation ne fait pas planter le flux fermé', async () => {
    const unexpected: unknown[] = [];
    const stream = sseStream(
      async (sender) => {
        sender.send('field', { path: 'a', value: 1 });
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('panne');
      },
      REQ,
      (err) => unexpected.push(err),
    );
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unexpected).toHaveLength(1);
  });
});

describe('sseStream : ordre et erreur au milieu', () => {
  it('les événements arrivent dans l’ordre d’envoi', async () => {
    const text = await readAll(
      sseStream(async (sender) => {
        sender.send('field', { path: 'a', value: 1 });
        sender.send('field', { path: 'b', value: 2 });
        sender.send('done', { ok: true });
        await Promise.resolve();
      }, REQ),
    );
    expect(text.match(/^event: (\w+)$/gm)).toEqual(['event: field', 'event: field', 'event: done']);
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
  });

  it('erreur après des champs : événement error au format Problem Details, puis le flux se ferme', async () => {
    const text = await readAll(
      sseStream(async (sender) => {
        sender.send('field', { path: 'a', value: 1 });
        await Promise.resolve();
        throw new AppError('provider_unavailable');
      }, REQ),
    );
    const events = text.match(/^event: (\w+)$/gm);
    expect(events).toEqual(['event: field', 'event: error']);
    const data = /event: error\ndata: (.*)\n/.exec(text)?.[1];
    expect(JSON.parse(data ?? '{}')).toMatchObject({
      code: 'provider_unavailable',
      status: 503,
      request_id: 'req_TEST',
    });
  });
});
