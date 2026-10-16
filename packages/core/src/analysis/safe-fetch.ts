// Lecture d'une page par le serveur (EC-SRC-01, EC-SRC-02). Garanties :
// - chaque adresse (la première ET chaque redirection, 5 au plus) passe par `resolvePublicTarget` avant toute
//   connexion, et la connexion se fait sur l'adresse validée (anti-rebinding) ;
// - la lecture s'arrête à `maxBytes` (le texte déjà lu est gardé) et au délai total `timeoutMs` ;
// - le corps décompressé est borné lui aussi (bombe de décompression) ;
// - le serveur se présente honnêtement (`PubekaBot`) : on ne se fait jamais passer pour un navigateur pour
//   contourner une protection anti-robot (EC-SRC-03).
import { AppError } from '@pubeka/contracts';
import { nodeTransport, type Transport, type TransportResponse } from './node-transport';
import {
  resolvePublicTarget,
  systemResolver,
  type DnsResolver,
  type PublicTarget,
} from './safe-url';

export const MAX_REDIRECTS = 5;
export const BOT_USER_AGENT = 'PubekaBot/1.0 (+https://pubeka.com)';

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  resolve?: DnsResolver;
  transport?: Transport;
  /**
   * Refuse de se connecter à un hôte atteint par REDIRECTION (ex. un lien raccourci qui mène à instagram.com) : la lecture
   * s'arrête avant toute connexion, `source_unreadable` (motif `login_required`).
   */
  skipRedirectedHost?: (hostname: string) => boolean;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  headers: Record<string, string>;
  body: Uint8Array;
  /** Vrai si la lecture a été coupée à la taille maximale ou au délai : le texte lu reste utilisable. */
  truncated: boolean;
  redirects: number;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function unreadable(reason: string, cause?: unknown): AppError {
  return new AppError('source_unreadable', {
    meta: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

/** Attend `promise` mais pas au-delà du délai total (la résolution DNS et la connexion ne sont pas abortables). */
async function within<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw unreadable('timeout');
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(unreadable('timeout'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
}

async function readCapped(
  response: TransportResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ body: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  const iterator = response.body[Symbol.asyncIterator]();
  try {
    for (;;) {
      // Chaque lecture est limitée par le délai total : un flux qui ne finit jamais est abandonné.
      const next = await within(iterator.next(), signal);
      if (next.done === true) break;
      const chunk = next.value;
      const room = maxBytes - total;
      if (chunk.length >= room) {
        chunks.push(chunk.subarray(0, room));
        total += room;
        truncated = true;
        break;
      }
      chunks.push(chunk);
      total += chunk.length;
    }
  } catch {
    // Délai dépassé ou connexion coupée pendant le corps : on garde ce qui a été lu.
    truncated = true;
  } finally {
    response.close();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body, truncated };
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const resolve = options.resolve ?? systemResolver;
  const transport = options.transport ?? nodeTransport;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const signal = AbortSignal.timeout(options.timeoutMs);

  let current: string | URL = raw;
  for (let hop = 0; ; hop += 1) {
    // Chaque saut, y compris le premier, est validé avant toute connexion (EC-SRC-01).
    const target: PublicTarget = await within(resolvePublicTarget(current, resolve), signal);
    if (hop > 0 && options.skipRedirectedHost?.(target.url.hostname) === true) {
      throw unreadable('login_required');
    }
    const address = target.addresses[0];
    if (address === undefined) throw unreadable('no_address');

    let response: TransportResponse;
    try {
      response = await within(
        transport({
          url: target.url,
          address,
          signal,
          headers: {
            'user-agent': BOT_USER_AGENT,
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'fr,en;q=0.8',
          },
        }),
        signal,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unreadable('connection', error);
    }

    const location = response.headers.location;
    if (REDIRECT_STATUS.has(response.status) && location !== undefined) {
      response.close();
      if (hop >= maxRedirects)
        throw new AppError('unsafe_url', { meta: { reason: 'too_many_redirects' } });
      try {
        current = new URL(location, target.url);
      } catch {
        throw new AppError('unsafe_url', { meta: { reason: 'invalid_redirect' } });
      }
      continue;
    }

    const { body, truncated } = await readCapped(response, options.maxBytes, signal);
    return {
      finalUrl: target.url.toString(),
      status: response.status,
      contentType: response.headers['content-type'] ?? null,
      headers: response.headers,
      body,
      truncated,
      redirects: hop,
    };
  }
}
