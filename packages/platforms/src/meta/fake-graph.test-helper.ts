// Fausse Graph API pour les tests : aucun appel réseau, les requêtes sont enregistrées.
// Remplace `jest.mock('axios')` des tests AdFacile (TESTING §6 : jamais de vrai service Meta en test).
import { GraphClient, DEFAULT_GRAPH_VERSION, type FetchLike } from './graph';
import type { MetaApiError } from './errors';

export interface RecordedCall {
  method: string;
  /** Chemin sans la version ni les paramètres (« act_1/campaigns »), ou l'URL absolue d'un média. */
  path: string;
  params: Record<string, string>;
  /** Corps JSON décodé (POST) ; undefined sans corps ou pour un multipart. */
  body: unknown;
  form: FormData | undefined;
}

export class GraphReply {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {},
    readonly bytes?: Uint8Array,
  ) {}
}

export const ok = (body: unknown): GraphReply => new GraphReply(200, body);
export const failure = (error: MetaApiError, status = 400): GraphReply =>
  new GraphReply(status, { error });
export const file = (contentType: string, content = 'octets'): GraphReply =>
  new GraphReply(200, null, { 'content-type': contentType }, new TextEncoder().encode(content));

export type GraphHandler = (call: RecordedCall) => GraphReply | Record<string, unknown> | undefined;

const PREFIX = `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/`;

export class FakeGraph {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly handler: GraphHandler) {}

  readonly fetch: FetchLike = (input, init) => {
    const url = new URL(input);
    const params = Object.fromEntries(url.searchParams.entries());
    url.search = '';
    const full = url.toString();
    const path = full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full;
    const raw = init?.body;
    const call: RecordedCall = {
      method: init?.method ?? 'GET',
      path,
      params,
      body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined,
      form: raw instanceof FormData ? raw : undefined,
    };
    this.calls.push(call);
    const reply = this.handler(call);
    const result = reply instanceof GraphReply ? reply : ok(reply ?? {});
    const body = result.bytes ?? JSON.stringify(result.body);
    return Promise.resolve(new Response(body, { status: result.status, headers: result.headers }));
  };

  client(): GraphClient {
    return new GraphClient({ fetch: this.fetch });
  }

  /** Appels dont la méthode et la fin du chemin correspondent. */
  find(method: string, suffix: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === method && c.path.endsWith(suffix));
  }
}
