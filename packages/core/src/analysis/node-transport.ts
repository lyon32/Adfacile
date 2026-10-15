// Transport HTTP(S) de la lecture des sources : connexion sur une adresse IP DÉJÀ VALIDÉE (`address`), jamais sur
// une nouvelle résolution du nom (anti-rebinding DNS). Le nom reste utilisé pour l'en-tête `Host` et pour le
// certificat TLS (SNI) : la connexion est donc correcte, seule la résolution est figée.
// Aucune redirection n'est suivie ici : `safe-fetch.ts` revérifie chaque adresse avant de continuer.
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';

export interface TransportRequest {
  url: URL;
  /** Adresse IP publique validée sur laquelle se connecter. */
  address: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  /** En-têtes en minuscules ; une valeur multiple est jointe par une virgule. */
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
  /** Coupe la connexion (corps trop gros, redirection). */
  close: () => void;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

function decoder(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip();
  if (encoding === 'deflate') return zlib.createInflate();
  if (encoding === 'br') return zlib.createBrotliDecompress();
  return null;
}

export const nodeTransport: Transport = ({ url, address, headers, signal }) =>
  new Promise<TransportResponse>((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(address) === 6 ? 6 : 4;
    const lib = secure ? https : http;
    const request = lib.request(
      {
        host,
        port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
        agent: false,
        signal,
        // Résolution figée : on répond toujours l'adresse validée, quel que soit le nom demandé.
        lookup: (_hostname, options, callback) => {
          if (options.all === true) {
            (callback as (e: null, a: { address: string; family: number }[]) => void)(null, [
              { address, family },
            ]);
          } else {
            callback(null, address, family);
          }
        },
        ...(secure && isIP(host) === 0 ? { servername: host } : {}),
      },
      (response) => {
        const out: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) out[name] = Array.isArray(value) ? value.join(', ') : value;
        }
        const encoding = (out['content-encoding'] ?? 'identity').toLowerCase().trim();
        let stream: Readable = response;
        if (encoding !== 'identity' && encoding !== '') {
          const unzip = decoder(encoding);
          if (unzip === null) {
            response.destroy();
            reject(new Error('content-encoding non pris en charge'));
            return;
          }
          // L'erreur du décodeur (flux corrompu) est portée par l'itérateur du corps.
          response.on('error', (error) => unzip.destroy(error));
          stream = response.pipe(unzip);
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: out,
          body: stream,
          close: () => {
            stream.destroy();
            response.destroy();
            request.destroy();
          },
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
