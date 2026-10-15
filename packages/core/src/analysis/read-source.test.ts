// Lecture des sources : EC-SRC-01 à EC-SRC-04 (SECURITY_NOTES §5.7), secours Jina, service tiers.
import { Readable } from 'node:stream';
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { createJinaReader, JINA_ENDPOINT, type JinaReader } from './jina';
import type { Transport, TransportResponse } from './node-transport';
import { MIN_READABLE_CHARS, readSource } from './read-source';
import type { DnsResolver } from './safe-url';

const enc = new TextEncoder();
const PUBLIC = '93.184.216.34';
const resolve: DnsResolver = () => Promise.resolve([PUBLIC]);
const OPTIONS = { timeoutMs: 2000, maxBytes: 200_000 };
const LONG_TEXT = 'Baskets Nike à Abidjan, livraison gratuite. '.repeat(10);

function page(
  status: number,
  html: string,
  headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' },
) {
  const response: TransportResponse = {
    status,
    headers,
    body: Readable.from([enc.encode(html)]),
    close: () => undefined,
  };
  return response;
}

function site(make: () => TransportResponse): { transport: Transport; calls: () => number } {
  let n = 0;
  return {
    transport: () => {
      n += 1;
      return Promise.resolve(make());
    },
    calls: () => n,
  };
}

function jina(answer: string | null): JinaReader & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    read: (url) => {
      urls.push(url);
      return Promise.resolve(answer);
    },
  };
}

const web = (url: string) => ({ type: 'website' as const, url });

describe('readSource : lecture interne', () => {
  it('lit un site et rend son texte, extracteur « internal »', async () => {
    const { transport } = site(() => page(200, `<title>Awa</title><p>${LONG_TEXT}</p>`));
    const result = await readSource(web('https://shop.example.com/'), OPTIONS, {
      resolve,
      transport,
    });
    expect(result).toMatchObject({ extractor: 'internal', status: 'ok' });
    expect(result.text).toContain('Baskets Nike');
  });

  it('un texte saisi par l’utilisateur est nettoyé et rendu tel quel', async () => {
    const result = await readSource(
      { type: 'text', text: '  Je vends des baskets\u0000 à Cocody  ' },
      OPTIONS,
    );
    expect(result).toEqual({
      text: 'Je vends des baskets  à Cocody',
      extractor: 'internal',
      status: 'ok',
    });
    expect((await readSource({ type: 'text', text: '   ' }, OPTIONS)).status).toBe('unreadable');
  });

  it('EC-SRC-07 : un site dans une autre langue est lu tel quel (l’analyse se fait dans la langue du site)', async () => {
    const english = 'Our sneakers are delivered in Douala within 48 hours. '.repeat(8);
    const { transport } = site(() => page(200, `<p>${english}</p>`));
    const result = await readSource(web('https://shop.example.com/'), OPTIONS, {
      resolve,
      transport,
    });
    expect(result.text).toContain('sneakers are delivered in Douala');
  });

  it('décode le jeu de caractères annoncé (ISO-8859-1)', async () => {
    const latin1 = Uint8Array.from([
      ...enc.encode('<p>'),
      0xe9,
      0xe9,
      ...enc.encode(` ${LONG_TEXT}</p>`),
    ]);
    const response: TransportResponse = {
      status: 200,
      headers: { 'content-type': 'text/html; charset=iso-8859-1' },
      body: Readable.from([latin1]),
      close: () => undefined,
    };
    const result = await readSource(web('https://shop.example.com/'), OPTIONS, {
      resolve,
      transport: () => Promise.resolve(response),
    });
    expect(result.text.startsWith('éé')).toBe(true);
  });
});

describe('readSource : EC-SRC-01, adresses refusées', () => {
  it('EC-SRC-01 : une adresse interne est refusée avant toute connexion et jamais envoyée à Jina', async () => {
    const { transport, calls } = site(() => page(200, LONG_TEXT));
    const fallback = jina(LONG_TEXT);
    await expect(
      readSource(web('http://169.254.169.254/latest/'), OPTIONS, {
        resolve,
        transport,
        jina: fallback,
      }),
    ).rejects.toMatchObject({ code: 'unsafe_url' });
    expect(calls()).toBe(0);
    expect(fallback.urls).toEqual([]);
  });

  it('EC-SRC-01 : une redirection vers l’interne est refusée (unsafe_url) et n’est pas « récupérée » par Jina', async () => {
    const { transport } = site(() => page(302, '', { location: 'http://127.0.0.1:80/admin' }));
    const fallback = jina(LONG_TEXT);
    await expect(
      readSource(web('https://shop.example.com/'), OPTIONS, { resolve, transport, jina: fallback }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fallback.urls).toEqual([]);
  });
});

describe('readSource : EC-SRC-02, page lourde ou sans fin', () => {
  it('EC-SRC-02 : une page de plus que la taille maximale est coupée, le texte lu suffit', async () => {
    const huge = `<p>${LONG_TEXT}</p>` + '<p>x</p>'.repeat(100_000);
    const { transport } = site(() => page(200, huge));
    const result = await readSource(
      web('https://shop.example.com/'),
      { timeoutMs: 2000, maxBytes: 5000 },
      { resolve, transport },
    );
    expect(result.status).toBe('ok');
    expect(result.text).toContain('Baskets Nike');
    expect(result.text.length).toBeLessThan(5000);
  });

  it('le texte est tronqué à 200 000 caractères au plus', async () => {
    const { transport } = site(() => page(200, `<p>${'mot '.repeat(300_000)}</p>`));
    const result = await readSource(
      web('https://shop.example.com/'),
      { timeoutMs: 4000, maxBytes: 5_000_000 },
      { resolve, transport },
    );
    expect(result.text.length).toBeLessThanOrEqual(200_000);
  });
});

describe('readSource : EC-SRC-03, protection anti-robot et secours Jina', () => {
  const challenge = () =>
    page(403, '<title>Just a moment...</title><p>Checking your browser before accessing</p>', {
      'content-type': 'text/html',
      'cf-mitigated': 'challenge',
    });

  it('EC-SRC-03 : défi anti-robot → un seul essai, puis Jina avec l’adresse publique seulement', async () => {
    const { transport, calls } = site(challenge);
    const fallback = jina(LONG_TEXT);
    const result = await readSource(web('https://shop.example.com/boutique'), OPTIONS, {
      resolve,
      transport,
      jina: fallback,
    });
    expect(result).toMatchObject({ status: 'ok', extractor: 'jina' });
    expect(fallback.urls).toEqual(['https://shop.example.com/boutique']);
    // On ne contourne jamais la protection : pas de deuxième tentative, pas de changement d'identité.
    expect(calls()).toBe(1);
  });

  it('EC-SRC-03 : sans clé Jina, ou si Jina échoue, la source est « illisible » (aucun contournement)', async () => {
    const { transport, calls } = site(challenge);
    const without = await readSource(web('https://shop.example.com/'), OPTIONS, {
      resolve,
      transport,
    });
    expect(without).toMatchObject({ status: 'unreadable', text: '', reason: 'bot_protection' });
    const failing = await readSource(web('https://shop.example.com/'), OPTIONS, {
      resolve,
      transport,
      jina: jina(null),
    });
    expect(failing.status).toBe('unreadable');
    expect(calls()).toBe(2);
  });

  it('une page de défi servie avec le code 200 n’est jamais prise pour le site', async () => {
    const { transport } = site(() =>
      page(200, '<title>Just a moment...</title><p>Verify you are human</p>'),
    );
    const result = await readSource(web('https://shop.example.com/'), OPTIONS, {
      resolve,
      transport,
    });
    expect(result.status).toBe('unreadable');
  });

  it('page vide (rendu JavaScript) : Jina en secours ; trop court aussi chez Jina → illisible', async () => {
    const { transport } = site(() => page(200, '<div id="root"></div><script>app()</script>'));
    expect(
      (
        await readSource(web('https://spa.example.com/'), OPTIONS, {
          resolve,
          transport,
          jina: jina(LONG_TEXT),
        })
      ).extractor,
    ).toBe('jina');
    expect(
      (
        await readSource(web('https://spa.example.com/'), OPTIONS, {
          resolve,
          transport,
          jina: jina('x'.repeat(MIN_READABLE_CHARS - 1)),
        })
      ).status,
    ).toBe('unreadable');
  });

  it('erreur 404 ou 500 : secours, puis illisible ; connexion impossible : illisible sans erreur interne', async () => {
    const { transport } = site(() => page(404, '<p>Introuvable</p>'));
    expect(
      (await readSource(web('https://shop.example.com/x'), OPTIONS, { resolve, transport })).reason,
    ).toBe('http_404');
    const refused: Transport = () => Promise.reject(new Error('ECONNREFUSED'));
    expect(
      (await readSource(web('https://down.example.com/'), OPTIONS, { resolve, transport: refused }))
        .status,
    ).toBe('unreadable');
  });

  it('un fichier qui n’est pas du texte (image, binaire) n’est pas lu comme une page', async () => {
    const { transport } = site(() =>
      page(200, 'PK\u0003\u0004binaire', { 'content-type': 'application/zip' }),
    );
    expect(
      (await readSource(web('https://shop.example.com/a.zip'), OPTIONS, { resolve, transport }))
        .status,
    ).toBe('unreadable');
  });
});

describe('readSource : EC-SRC-04, publication qui exige d’être connecté', () => {
  it.each([
    'https://www.facebook.com/boutique/posts/123',
    'https://m.facebook.com/story.php?id=1',
    'https://www.instagram.com/p/ABC/',
    'https://fb.watch/xyz/',
    'https://x.com/boutique/status/1',
  ])('EC-SRC-04 : %s est illisible sans aucune requête ni appel à Jina', async (url) => {
    const { transport, calls } = site(() => page(200, LONG_TEXT));
    const fallback = jina(LONG_TEXT);
    const result = await readSource({ type: 'social_post', url }, OPTIONS, {
      resolve,
      transport,
      jina: fallback,
    });
    expect(result).toMatchObject({ status: 'unreadable', reason: 'login_required' });
    expect(calls()).toBe(0);
    expect(fallback.urls).toEqual([]);
  });

  it('un site dont le nom ressemble seulement à Facebook est lu normalement', async () => {
    const { transport } = site(() => page(200, `<p>${LONG_TEXT}</p>`));
    const result = await readSource(web('https://notfacebook.com/'), OPTIONS, {
      resolve,
      transport,
    });
    expect(result.status).toBe('ok');
  });
});

describe('createJinaReader : service tiers', () => {
  it('envoie seulement l’adresse publique, avec la clé en en-tête d’autorisation (jamais dans le corps ni l’adresse)', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ code: 200, data: { content: 'Contenu lu' } })),
      );
    }) as typeof fetch;
    const key = ['jina', 'test', String(Date.now())].join('_');
    const reader = createJinaReader({ apiKey: key, fetchImpl });
    expect(await reader.read('https://shop.example.com/', AbortSignal.timeout(1000))).toBe(
      'Contenu lu',
    );
    expect(seen[0]?.url).toBe(JINA_ENDPOINT);
    expect(seen[0]?.init.method).toBe('POST');
    const sentBody = seen[0]?.init.body;
    expect(typeof sentBody === 'string' ? (JSON.parse(sentBody) as unknown) : null).toEqual({
      url: 'https://shop.example.com/',
    });
    expect((seen[0]?.init.headers as Record<string, string> | undefined)?.authorization).toBe(
      `Bearer ${key}`,
    );
    expect(sentBody).not.toContain(key);
  });

  it('Jina : aucune redirection (la clé ne suit pas), réponse démesurée refusée', async () => {
    let init: RequestInit | undefined;
    const fetchImpl = ((_url: string, request: RequestInit) => {
      init = request;
      return Promise.resolve(new Response('x', { headers: { 'content-length': '999999999' } }));
    }) as typeof fetch;
    const reader = createJinaReader({ apiKey: 'k', fetchImpl });
    expect(await reader.read('https://shop.example.com/', AbortSignal.timeout(1000))).toBeNull();
    expect(init?.redirect).toBe('error');
  });

  it('une erreur, une réponse illisible ou vide donne null sans lever d’exception', async () => {
    const make = (impl: () => Promise<Response>) =>
      createJinaReader({ apiKey: 'k', fetchImpl: impl });
    const signal = AbortSignal.timeout(1000);
    expect(
      await make(() => Promise.resolve(new Response('', { status: 429 }))).read(
        'https://a.example.com/',
        signal,
      ),
    ).toBeNull();
    expect(
      await make(() => Promise.resolve(new Response('pas du json'))).read(
        'https://a.example.com/',
        signal,
      ),
    ).toBeNull();
    expect(
      await make(() => Promise.resolve(new Response('{"data":{"content":"  "}}'))).read(
        'https://a.example.com/',
        signal,
      ),
    ).toBeNull();
    expect(
      await make(() => Promise.reject(new Error('réseau'))).read('https://a.example.com/', signal),
    ).toBeNull();
  });
});
