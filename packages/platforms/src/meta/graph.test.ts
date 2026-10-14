import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH_VERSION, GraphClient, MAX_DOWNLOAD_BYTES } from './graph';
import { MetaGraphError } from './errors';
import { failure, FakeGraph, file, GraphReply } from './fake-graph.test-helper';

describe('GraphClient', () => {
  it('appelle la version configurée de la Graph API', async () => {
    const urls: string[] = [];
    const client = new GraphClient({
      version: 'v23.0',
      fetch: (input) => {
        urls.push(input);
        return Promise.resolve(new Response('{}'));
      },
    });
    await client.get('act_1/campaigns', {
      access_token: 't',
      limit: 5,
      ignore: undefined,
      nul: null,
    });
    expect(urls).toEqual([
      'https://graph.facebook.com/v23.0/act_1/campaigns?access_token=t&limit=5',
    ]);
  });

  it('envoie un corps JSON en POST, le jeton restant dans les paramètres', async () => {
    const graph = new FakeGraph(() => ({ id: '1' }));
    const reply = await graph
      .client()
      .post('act_1/campaigns', { name: 'C' }, { access_token: 't' });
    expect(reply).toEqual({ id: '1' });
    expect(graph.calls[0]).toMatchObject({
      method: 'POST',
      body: { name: 'C' },
      params: { access_token: 't' },
    });
  });

  it('envoie un multipart avec postForm et supprime avec delete', async () => {
    const graph = new FakeGraph(() => ({ success: true }));
    const form = new FormData();
    form.append('source', new Blob(['x']), 'a.png');
    await graph.client().postForm('act_1/adimages', form, { access_token: 't' });
    await graph.client().delete('123', { access_token: 't' });
    expect(graph.calls[0]?.form?.get('source')).toBeInstanceOf(Blob);
    expect(graph.calls[1]).toMatchObject({ method: 'DELETE', path: '123' });
  });

  it('transforme une réponse non 2xx en MetaGraphError avec l’objet error de Meta', async () => {
    const graph = new FakeGraph(() =>
      failure({ code: 190, error_subcode: 460, message: 'secret technique' }, 401),
    );
    const error = await graph
      .client()
      .get('me')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaGraphError);
    expect(error).toMatchObject({ httpStatus: 401, fbError: { code: 190, error_subcode: 460 } });
  });

  it('n’inclut jamais le jeton ni l’URL dans le message d’erreur', async () => {
    const graph = new FakeGraph(() => new GraphReply(500, 'pas du json'));
    const error = await graph
      .client()
      .get('me', { access_token: 'JETON-SECRET' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaGraphError);
    expect((error as Error).message).not.toContain('JETON-SECRET');
    expect((error as Error).message).toMatch(/HTTP 500/);
  });

  it('télécharge un média et renvoie ses octets et son type', async () => {
    const graph = new FakeGraph(() => file('image/png', 'png!'));
    const { bytes, contentType } = await graph.client().download('https://cdn.test/a.png', 1000);
    expect(new TextDecoder().decode(bytes)).toBe('png!');
    expect(contentType).toBe('image/png');
  });

  it('refuse un téléchargement en échec', async () => {
    const graph = new FakeGraph(() => new GraphReply(404, null));
    await expect(graph.client().download('https://cdn.test/a.png', 1000)).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it('utilise le fetch global quand aucun n’est fourni', () => {
    expect(new GraphClient().baseUrl).toBe('https://graph.facebook.com/v26.0');
  });

  // Porté de backend/src/config/facebook.test.js (« version de la Graph API »).
  it('utilise la version configurée quand elle est définie', () => {
    expect(new GraphClient({ version: 'v42.0' }).baseUrl).toBe('https://graph.facebook.com/v42.0');
  });

  it('retombe sur une version par défaut en l’absence de configuration', () => {
    expect(DEFAULT_GRAPH_VERSION).toMatch(/^v\d+\.\d+$/);
    expect(new GraphClient().baseUrl).toContain(DEFAULT_GRAPH_VERSION);
  });

  describe('download — garde-fous', () => {
    it('ne suit aucune redirection (une redirection pourrait mener à une adresse interne)', async () => {
      let init: RequestInit | undefined;
      const client = new GraphClient({
        fetch: (_url, i) => {
          init = i;
          return Promise.resolve(new Response('x'));
        },
      });
      await client.download('https://cdn.test/a.png', 1000);
      expect(init?.redirect).toBe('error');
    });

    it('refuse un fichier dont Content-Length dépasse la taille maximale', async () => {
      const client = new GraphClient({
        fetch: () => Promise.resolve(new Response('x', { headers: { 'content-length': '100' } })),
      });
      await expect(client.download('https://cdn.test/a.png', 1000, 10)).rejects.toThrow(
        /trop volumineux/,
      );
    });

    it('refuse un fichier qui dépasse la taille maximale en cours de lecture, même sans Content-Length', async () => {
      const client = new GraphClient({
        fetch: () => Promise.resolve(new Response('0123456789ABC')),
      });
      await expect(client.download('https://cdn.test/a.png', 1000, 10)).rejects.toThrow(
        /trop volumineux/,
      );
      await expect(client.download('https://cdn.test/a.png', 1000, 13)).resolves.toBeDefined();
    });

    it('fixe la taille maximale par défaut à 50 Mo', () => {
      expect(MAX_DOWNLOAD_BYTES).toBe(50 * 1024 * 1024);
    });

    it('accepte une réponse sans corps', async () => {
      const client = new GraphClient({
        fetch: () => Promise.resolve(new Response(null, { status: 200 })),
      });
      expect((await client.download('https://cdn.test/a.png', 1000)).bytes).toHaveLength(0);
    });
  });
});
