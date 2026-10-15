// Lecture sécurisée d'une page (EC-SRC-01, EC-SRC-02) avec un faux transport : aucune connexion réelle.
import { Readable } from 'node:stream';
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import type { Transport, TransportRequest, TransportResponse } from './node-transport';
import { safeFetch } from './safe-fetch';
import type { DnsResolver } from './safe-url';

const PUBLIC = '93.184.216.34';
const enc = new TextEncoder();

function reply(
  status: number,
  body: Uint8Array[] | AsyncIterable<Uint8Array>,
  headers: Record<string, string> = {},
): TransportResponse {
  return {
    status,
    headers,
    body: Array.isArray(body) ? Readable.from(body) : body,
    close: () => undefined,
  };
}

/** Faux transport : un site par nom d'hôte, et le journal des connexions (hôte + adresse utilisée). */
function sites(
  pages: Record<
    string,
    (request: TransportRequest) => TransportResponse | Promise<TransportResponse>
  >,
) {
  const connections: { host: string; address: string; headers: Record<string, string> }[] = [];
  const transport: Transport = (request) => {
    connections.push({
      host: request.url.hostname,
      address: request.address,
      headers: request.headers,
    });
    const page = pages[request.url.hostname];
    return page === undefined
      ? Promise.reject(new Error('ECONNREFUSED'))
      : Promise.resolve(page(request));
  };
  return { transport, connections };
}

const dns =
  (map: Record<string, string[]> = {}): DnsResolver =>
  (host) =>
    Promise.resolve(map[host] ?? [PUBLIC]);

const OPTIONS = { timeoutMs: 2000, maxBytes: 1000 };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : 'autre';
  }
}

describe('safeFetch : lecture normale', () => {
  it('lit la page en se connectant sur l’adresse validée, avec une identité honnête', async () => {
    const { transport, connections } = sites({
      'shop.example.com': () =>
        reply(200, [enc.encode('<p>Bonjour</p>')], { 'content-type': 'text/html' }),
    });
    const result = await safeFetch('https://shop.example.com/', {
      ...OPTIONS,
      transport,
      resolve: dns(),
    });
    expect(new TextDecoder().decode(result.body)).toBe('<p>Bonjour</p>');
    expect(result.status).toBe(200);
    expect(result.truncated).toBe(false);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.address).toBe(PUBLIC);
    expect(connections[0]?.headers['user-agent']).toMatch(/^PubekaBot/);
  });
});

describe('safeFetch : EC-SRC-01, redirections', () => {
  it('EC-SRC-01 : une redirection vers une adresse interne est refusée à cette redirection (unsafe_url)', async () => {
    const { transport, connections } = sites({
      'shop.example.com': () =>
        reply(302, [], { location: 'http://169.254.169.254/latest/meta-data/' }),
    });
    expect(
      await codeOf(
        safeFetch('https://shop.example.com/', { ...OPTIONS, transport, resolve: dns() }),
      ),
    ).toBe('unsafe_url');
    // Aucune connexion n'a été ouverte vers l'adresse interne.
    expect(connections.map((c) => c.host)).toEqual(['shop.example.com']);
  });

  it('EC-SRC-01 : une redirection vers un nom qui se résout en adresse privée est refusée (rebinding)', async () => {
    const { transport, connections } = sites({
      'a.example.com': () => reply(301, [], { location: 'https://b.example.com/' }),
      'b.example.com': () => reply(200, [enc.encode('secret')], { 'content-type': 'text/html' }),
    });
    const resolve = dns({ 'b.example.com': ['10.0.0.9'] });
    expect(
      await codeOf(safeFetch('https://a.example.com/', { ...OPTIONS, transport, resolve })),
    ).toBe('unsafe_url');
    expect(connections.map((c) => c.host)).toEqual(['a.example.com']);
  });

  it('EC-SRC-01 : une redirection vers un schéma interdit ou un port inhabituel est refusée', async () => {
    for (const location of [
      'file:///etc/passwd',
      'ftp://example.com/',
      'https://example.com:6379/',
    ]) {
      const { transport } = sites({ 'shop.example.com': () => reply(302, [], { location }) });
      expect(
        await codeOf(
          safeFetch('https://shop.example.com/', { ...OPTIONS, transport, resolve: dns() }),
        ),
      ).toBe('unsafe_url');
    }
  });

  it('suit jusqu’à 5 redirections publiques, la 6ᵉ est refusée', async () => {
    const chain = (steps: number) => {
      const pages: Record<string, () => TransportResponse> = {};
      for (let i = 0; i < steps; i += 1) {
        pages[`h${String(i)}.example.com`] = () =>
          reply(302, [], { location: `https://h${String(i + 1)}.example.com/` });
      }
      pages[`h${String(steps)}.example.com`] = () =>
        reply(200, [enc.encode('fin')], { 'content-type': 'text/html' });
      return sites(pages).transport;
    };
    const ok = await safeFetch('https://h0.example.com/', {
      ...OPTIONS,
      transport: chain(5),
      resolve: dns(),
    });
    expect(ok.redirects).toBe(5);
    expect(
      await codeOf(
        safeFetch('https://h0.example.com/', { ...OPTIONS, transport: chain(6), resolve: dns() }),
      ),
    ).toBe('unsafe_url');
  });

  it('une adresse de départ interne est refusée avant toute connexion', async () => {
    const { transport, connections } = sites({});
    expect(
      await codeOf(safeFetch('http://127.0.0.1:80/', { ...OPTIONS, transport, resolve: dns() })),
    ).toBe('unsafe_url');
    expect(connections).toHaveLength(0);
  });
});

describe('safeFetch : EC-SRC-02, page lourde ou sans fin', () => {
  it('EC-SRC-02 : la lecture est coupée à la taille maximale et le texte déjà lu est rendu', async () => {
    const { transport } = sites({
      'big.example.com': () =>
        reply(200, [enc.encode('a'.repeat(600)), enc.encode('b'.repeat(600))]),
    });
    const result = await safeFetch('https://big.example.com/', {
      ...OPTIONS,
      transport,
      resolve: dns(),
    });
    expect(result.body.length).toBe(1000);
    expect(result.truncated).toBe(true);
  });

  it('EC-SRC-02 : un flux qui ne finit jamais est interrompu au délai maximal, le texte reçu est gardé', async () => {
    async function* endless(): AsyncGenerator<Uint8Array> {
      yield enc.encode('début de page');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      yield enc.encode('jamais lu');
    }
    const { transport } = sites({ 'slow.example.com': () => reply(200, endless()) });
    const started = Date.now();
    const result = await safeFetch('https://slow.example.com/', {
      timeoutMs: 150,
      maxBytes: 1000,
      transport,
      resolve: dns(),
    });
    // Le flux est abandonné au délai ; ici l'itération n'est pas interrompue par le faux, donc on borne le temps total.
    expect(Date.now() - started).toBeLessThan(4000);
    expect(new TextDecoder().decode(result.body)).toContain('début de page');
  }, 10_000);

  it('EC-SRC-02 : un serveur qui ne répond jamais donne source_unreadable au délai', async () => {
    const hang: Transport = () => new Promise<TransportResponse>(() => undefined);
    const started = Date.now();
    expect(
      await codeOf(
        safeFetch('https://hang.example.com/', {
          timeoutMs: 100,
          maxBytes: 1000,
          transport: hang,
          resolve: dns(),
        }),
      ),
    ).toBe('source_unreadable');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('une connexion refusée donne source_unreadable (et non une erreur interne)', async () => {
    const { transport } = sites({});
    expect(
      await codeOf(
        safeFetch('https://down.example.com/', { ...OPTIONS, transport, resolve: dns() }),
      ),
    ).toBe('source_unreadable');
  });
});
