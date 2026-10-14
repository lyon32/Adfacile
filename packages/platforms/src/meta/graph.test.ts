import { describe, expect, it } from 'vitest';
import { GraphClient } from './graph';
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
});
