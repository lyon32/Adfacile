import { describe, expect, it } from 'vitest';
import { failure, FakeGraph, file, type GraphHandler } from './fake-graph.test-helper';
import { MetaValidationError } from './errors';
import {
  findWhatsAppIdentity,
  rollbackFacebookObjects,
  uploadAdImage,
  uploadAdVideo,
  uploadMediaItem,
} from './media-upload';

// Tests portés de backend/src/services/facebookAdsService.test.js (TR-PLA-02) : uploadAdImage,
// uploadAdVideo, rollbackFacebookObjects.
describe('uploadAdImage', () => {
  it('envoie les octets en multipart, pas une URL distante', async () => {
    // Passer { url } à /adimages échoue avec « (#3) Application does not have the capability to make this
    // API call ».
    const graph = new FakeGraph((call) =>
      call.path.startsWith('https://cdn.test')
        ? file('image/png', 'fake-png')
        : { images: { 'creative.png': { hash: 'abc123' } } },
    );

    const hash = await uploadAdImage(graph.client(), 'act_1', 'token', 'https://cdn.test/img.png');

    expect(hash).toBe('abc123');
    expect(graph.calls[0]).toMatchObject({ method: 'GET', path: 'https://cdn.test/img.png' });
    const envoi = graph.calls[1];
    expect(envoi).toMatchObject({
      method: 'POST',
      path: 'act_1/adimages',
      params: { access_token: 'token' },
    });
    expect(envoi?.body).toBeUndefined();
    expect(envoi?.params).not.toHaveProperty('url');
    const source = envoi?.form?.get('source');
    expect(source).toBeInstanceOf(File);
    expect((source as File).name).toBe('img.png');
    expect((source as File).type).toBe('image/png');
  });

  it('rejette une URL blob: laissée par un aperçu local', async () => {
    const graph = new FakeGraph(() => ({}));
    await expect(
      uploadAdImage(graph.client(), 'act_1', 'token', 'blob:http://localhost:5173/abc'),
    ).rejects.toThrow(/téléversé/i);
    expect(graph.calls).toHaveLength(0);
  });

  it("n'accepte que les hôtes de médias autorisés quand la liste est fournie (SSRF)", async () => {
    const graph = new FakeGraph(() => ({}));
    const options = { allowedMediaHosts: ['storage.pubeka.test'] };
    await expect(
      uploadAdImage(graph.client(), 'act_1', 't', 'https://169.254.169.254/latest', options),
    ).rejects.toBeInstanceOf(MetaValidationError);
    await expect(
      uploadAdImage(graph.client(), 'act_1', 't', 'http://[bad', options),
    ).rejects.toBeInstanceOf(MetaValidationError);
    expect(graph.calls).toHaveLength(0);
  });

  it('échoue si Meta ne renvoie pas de hash, au lieu de continuer sans visuel', async () => {
    const graph = new FakeGraph((call) =>
      call.path.startsWith('https://') ? file('image/png') : { images: {} },
    );
    await expect(
      uploadAdImage(graph.client(), 'act_1', 'token', 'https://cdn.test/i.png'),
    ).rejects.toThrow(/identifiant/i);
  });

  it("type l'image en JPEG quand le serveur ne dit rien", async () => {
    const graph = new FakeGraph((call) =>
      call.path.startsWith('https://') ? file('', 'x') : { images: { a: { hash: 'h' } } },
    );
    await uploadAdImage(graph.client(), 'act_1', 't', 'https://cdn.test/dossier/');
    const source = graph.calls[1]?.form?.get('source') as File;
    expect(source.name).toBe('creative');
  });
});

describe('rollbackFacebookObjects', () => {
  it('supprime les objets créés, du plus fin au plus large', async () => {
    const graph = new FakeGraph(() => ({ success: true }));
    await rollbackFacebookObjects(
      graph.client(),
      { campaign: 'C1', adset: 'A1', creative: null, ad: null },
      'token',
    );
    expect(graph.calls.map((c) => c.path)).toEqual(['A1', 'C1']);
    expect(graph.calls.every((c) => c.method === 'DELETE')).toBe(true);
  });

  it("ne touche à rien quand aucun objet n'a été créé", async () => {
    const graph = new FakeGraph(() => ({}));
    await rollbackFacebookObjects(
      graph.client(),
      { campaign: null, adset: null, creative: null, ad: null },
      't',
    );
    expect(graph.calls).toHaveLength(0);
  });

  it("n'éclipse pas l'erreur d'origine si l'annulation échoue", async () => {
    const graph = new FakeGraph(() => failure({ message: 'Meta indisponible' }, 500));
    await expect(
      rollbackFacebookObjects(graph.client(), { campaign: 'C1' }, 'token'),
    ).resolves.toBeUndefined();
    expect(graph.calls).toHaveLength(1);
  });
});

describe('uploadAdVideo', () => {
  const sansPause = { pause: () => Promise.resolve(), intervalleMs: 3000, delaiMaxMs: 9000 };

  function graphVideo(statuts: string[]): FakeGraph {
    const file_ = [...statuts];
    const handler: GraphHandler = (call) => {
      if (call.path.startsWith('https://cdn.test')) return file('', 'v');
      if (call.method === 'POST') return { id: 'VID' };
      if (call.path.endsWith('/thumbnails'))
        return { data: [{ uri: 'https://t/1.jpg', is_preferred: true }] };
      return { status: { video_status: file_.shift() ?? statuts.at(-1) } };
    };
    return new FakeGraph(handler);
  }

  it('envoie les octets en multipart sur /advideos', async () => {
    const graph = graphVideo(['ready']);
    await uploadAdVideo(graph.client(), 'act_1', 'token', 'https://cdn.test/v.mp4', sansPause);
    const envoi = graph.find('POST', 'act_1/advideos')[0];
    expect(envoi?.form?.get('source')).toBeInstanceOf(File);
  });

  it('attend que la vidéo soit prête puis renvoie la miniature préférée', async () => {
    const graph = graphVideo(['processing', 'processing', 'ready']);
    const res = await uploadAdVideo(
      graph.client(),
      'act_1',
      'token',
      'https://cdn.test/v.mp4',
      sansPause,
    );
    expect(res).toEqual({ video_id: 'VID', thumbnail_url: 'https://t/1.jpg' });
  });

  it('échoue clairement si Meta ne parvient pas à traiter la vidéo', async () => {
    const graph = graphVideo(['error']);
    await expect(
      uploadAdVideo(graph.client(), 'act_1', 'token', 'https://cdn.test/v.mp4', sansPause),
    ).rejects.toThrow(/traiter la vidéo/);
  });

  it('abandonne après le délai maximal', async () => {
    const graph = graphVideo([
      'processing',
      'processing',
      'processing',
      'processing',
      'processing',
    ]);
    await expect(
      uploadAdVideo(graph.client(), 'act_1', 'token', 'https://cdn.test/v.mp4', sansPause),
    ).rejects.toThrow(/trop de temps/);
  });

  it('refuse une URL blob: et un envoi sans identifiant de vidéo', async () => {
    const graph = new FakeGraph((call) =>
      call.path.startsWith('https://') ? file('video/mp4') : {},
    );
    await expect(uploadAdVideo(graph.client(), 'act_1', 't', 'blob:x', sansPause)).rejects.toThrow(
      /téléversée/,
    );
    await expect(
      uploadAdVideo(graph.client(), 'act_1', 't', 'https://cdn.test/v.mp4', sansPause),
    ).rejects.toThrow(/identifiant/);
  });

  it('prend la première miniature à défaut de miniature préférée, ou null', async () => {
    const mk = (thumbs: Record<string, unknown>[]): FakeGraph =>
      new FakeGraph((call) => {
        if (call.path.startsWith('https://cdn')) return file('video/mp4');
        if (call.method === 'POST') return { id: 'V' };
        if (call.path.endsWith('/thumbnails')) return { data: thumbs };
        return { status: { video_status: 'ready' } };
      });
    expect(
      (
        await uploadAdVideo(
          mk([{ uri: 'a' }, { uri: 'b' }]).client(),
          'act_1',
          't',
          'https://cdn.test/v.mp4',
          sansPause,
        )
      ).thumbnail_url,
    ).toBe('a');
    expect(
      (await uploadAdVideo(mk([]).client(), 'act_1', 't', 'https://cdn.test/v.mp4', sansPause))
        .thumbnail_url,
    ).toBeNull();
  });

  it("utilise l'attente réelle par défaut (aucune pause quand la vidéo est déjà prête)", async () => {
    const graph = graphVideo(['ready']);
    const res = await uploadAdVideo(graph.client(), 'act_1', 'token', 'https://cdn.test/v.mp4');
    expect(res.video_id).toBe('VID');
  });
});

describe('uploadMediaItem', () => {
  it('aiguille une image vers son hash et une vidéo vers son identifiant', async () => {
    const graph = new FakeGraph((call) => {
      if (call.path.startsWith('https://cdn')) return file('');
      if (call.path.endsWith('adimages')) return { images: { a: { hash: 'H' } } };
      if (call.method === 'POST') return { id: 'V' };
      if (call.path.endsWith('/thumbnails')) return { data: [] };
      return { status: { video_status: 'ready' } };
    });
    const g = graph.client();
    expect(
      await uploadMediaItem(g, 'act_1', 't', { url: 'https://cdn.test/a.jpg', type: 'image' }),
    ).toEqual({ type: 'image', hash: 'H' });
    expect(
      await uploadMediaItem(g, 'act_1', 't', { url: 'https://cdn.test/a.mp4', type: 'video' }),
    ).toEqual({
      type: 'video',
      video_id: 'V',
      thumbnail_url: null,
    });
  });
});

describe('findWhatsAppIdentity', () => {
  it("prend l'identité la plus fréquente parmi les créations de la même Page", async () => {
    const graph = new FakeGraph(() => ({
      data: [
        {
          object_story_spec: { page_id: 'P' },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'A' },
        },
        {
          object_story_spec: { page_id: 'P' },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'B' },
        },
        {
          object_story_spec: { page_id: 'P' },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'B' },
        },
        {
          object_story_spec: { page_id: 'AUTRE' },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'C' },
        },
        { object_story_spec: { page_id: 'P' } },
      ],
    }));
    expect(await findWhatsAppIdentity(graph.client(), 'act_1', 't', 'P')).toBe('B');
  });

  it('renvoie null sans identité connue ou si la lecture échoue', async () => {
    expect(
      await findWhatsAppIdentity(new FakeGraph(() => ({ data: [] })).client(), 'act_1', 't', 'P'),
    ).toBeNull();
    expect(
      await findWhatsAppIdentity(
        new FakeGraph(() => failure({ message: 'x' })).client(),
        'act_1',
        't',
        'P',
      ),
    ).toBeNull();
  });
});
