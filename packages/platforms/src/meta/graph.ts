// Client minimal de la Graph API de Meta, au-dessus de `fetch` (axios est interdit : CONVENTIONS §3.3).
// Il reproduit ce que faisait axios dans AdFacile : le jeton voyage dans les paramètres d'URL, le corps
// est du JSON, un envoi de fichier est un multipart. Aucune URL (donc aucun jeton) n'est jamais journalisée
// ni placée dans un message d'erreur.
// Documentation : https://developers.facebook.com/docs/graph-api/overview
import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { MetaGraphError, MetaValidationError, parseMetaError } from './errors';

/** Version appelée par défaut ; surchargeable (`META_GRAPH_API_VERSION`) sans redéployer le code. */
export const DEFAULT_GRAPH_VERSION = 'v26.0';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GraphParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface GraphClientOptions {
  fetch?: FetchLike;
  version?: string;
}

export interface GraphRequestOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Taille maximale d'un média téléchargé (la plus grande limite de Meta pour nous : une vidéo de 50 Mo). */
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

export class GraphClient {
  readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(options: GraphClientOptions = {}) {
    this.baseUrl = `https://graph.facebook.com/${options.version ?? DEFAULT_GRAPH_VERSION}`;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  }

  /** `path` est relatif à la version (« act_1/campaigns ») ; une URL absolue est utilisée telle quelle. */
  private url(path: string, params: GraphParams): string {
    const base = /^https?:\/\//i.test(path) ? path : `${this.baseUrl}/${path}`;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
  }

  private async send(
    method: string,
    path: string,
    params: GraphParams,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    const response = await this.fetchFn(this.url(path, params), {
      ...init,
      method,
      signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new MetaGraphError(
        parseMetaError(body) ?? { message: `Réponse HTTP ${String(response.status)}` },
        response.status,
      );
    }
    return response;
  }

  async get(
    path: string,
    params: GraphParams = {},
    options: GraphRequestOptions = {},
  ): Promise<unknown> {
    const response = await this.send('GET', path, params, {}, options.timeoutMs);
    return response.json();
  }

  async post(
    path: string,
    body: unknown,
    params: GraphParams = {},
    options: GraphRequestOptions = {},
  ): Promise<unknown> {
    const response = await this.send(
      'POST',
      path,
      params,
      { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      options.timeoutMs,
    );
    return response.json();
  }

  async postForm(
    path: string,
    form: FormData,
    params: GraphParams = {},
    options: GraphRequestOptions = {},
  ): Promise<unknown> {
    const response = await this.send('POST', path, params, { body: form }, options.timeoutMs);
    return response.json();
  }

  async delete(
    path: string,
    params: GraphParams = {},
    options: GraphRequestOptions = {},
  ): Promise<unknown> {
    const response = await this.send('DELETE', path, params, {}, options.timeoutMs);
    return response.json();
  }

  /**
   * Télécharge un fichier (visuel) ; les octets sont renvoyés pour être envoyés en multipart à Meta.
   * Garde-fous contre le téléchargement d'un contenu hors de propos (SSRF, épuisement de mémoire) : aucune
   * redirection n'est suivie (une redirection pourrait mener à une adresse interne) et la taille est bornée,
   * d'abord par l'en-tête Content-Length puis pendant la lecture.
   */
  async download(
    url: string,
    timeoutMs: number,
    maxBytes: number = MAX_DOWNLOAD_BYTES,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | null }> {
    const response = await this.fetchFn(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Téléchargement du média impossible (HTTP ${String(response.status)})`);
    }
    const tooBig = new MetaValidationError('Le fichier est trop volumineux.');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      throw tooBig;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    while (reader) {
      const result = await reader.read();
      if (result.done) break;
      const value = result.value;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooBig;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, contentType: response.headers.get('content-type') };
  }
}
