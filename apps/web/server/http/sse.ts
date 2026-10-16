// Flux text/event-stream (API_SPEC §10). Une erreur pendant le flux part dans un événement
// `error` au format Problem Details (§3), puis le flux se ferme.
// Documentation : https://nextjs.org/docs/app/guides/streaming (« Streaming in Route Handlers »).
//
// Déconnexion du client : le flux est annulé (`cancel`), les envois suivants sont ignorés sans erreur et `onCancel` est
// appelé. Le travail en cours N'EST PAS interrompu par défaut : c'est l'appelant qui décide (le Stratège termine et
// enregistre sa proposition, pour qu'une reconnexion avec la même clé la retrouve au lieu de payer un second appel).
import { AppError, type Problem } from '@pubeka/contracts';
import { problemBody } from './problem';

export interface SseSender {
  send(event: string, data: unknown): void;
  /** Le client est parti : inutile d'écrire. */
  readonly closed: boolean;
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
  onCancel: () => void = () => undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const sender: SseSender = {
        send: (event, data) => {
          if (closed) return;
          controller.enqueue(encoder.encode(formatSseEvent(event, data)));
        },
        get closed() {
          return closed;
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
        if (!closed) controller.close();
      }
    },
    cancel() {
      closed = true;
      onCancel();
    },
  });
}

export function sseHeaders(requestId: string): Record<string, string> {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-content-type-options': 'nosniff',
    'x-accel-buffering': 'no',
    'x-request-id': requestId,
  };
}
