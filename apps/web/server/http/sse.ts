// Flux text/event-stream (API_SPEC §10). Une erreur pendant le flux part dans un événement
// `error` au format Problem Details (§3), puis le flux se ferme.
import { AppError, type Problem } from '@pubeka/contracts';
import { problemBody } from './problem';

export interface SseSender {
  send(event: string, data: unknown): void;
}

export function formatSseEvent(event: string, data: unknown): string {
  if (!/^[a-z_]+$/.test(event)) throw new Error(`Nom d'événement SSE invalide : ${event}`);
  // JSON.stringify n'écrit jamais de retour à la ligne brut : une seule ligne `data:`.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Construit le flux : `produce` envoie ses événements ; toute exception devient un
 * événement `error` (une erreur inattendue devient `internal_error`, sans détail).
 */
export function sseStream(
  produce: (sender: SseSender) => Promise<void>,
  req: { path: string; requestId: string },
  onUnexpected: (err: unknown) => void = () => undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const sender: SseSender = {
        send: (event, data) => {
          controller.enqueue(encoder.encode(formatSseEvent(event, data)));
        },
      };
      try {
        await produce(sender);
      } catch (err) {
        const appError = err instanceof AppError ? err : new AppError('internal_error');
        if (!(err instanceof AppError)) onUnexpected(err);
        const body: Problem = problemBody(appError, req);
        sender.send('error', body);
      } finally {
        controller.close();
      }
    },
  });
}

export function sseHeaders(requestId: string): Record<string, string> {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-request-id': requestId,
  };
}
