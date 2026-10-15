// Capacité « voit les images » des modèles, lue chez OpenRouter (jamais une liste de noms dans le code).
import { describe, expect, it } from 'vitest';
import { OpenRouterModelCatalog, StaticModelCatalog } from './model-catalog';

const LIST = {
  data: [
    { id: 'test/voit', architecture: { input_modalities: ['text', 'image'] } },
    { id: 'test/texte', architecture: { input_modalities: ['text'] } },
    { id: 'test/sans-architecture' },
  ],
};

function fetchOf(calls: { n: number }, impl: () => Response | Promise<Response>): typeof fetch {
  return () => {
    calls.n += 1;
    return Promise.resolve(impl());
  };
}

describe('OpenRouterModelCatalog', () => {
  it('dit si un modèle accepte les images, d’après architecture.input_modalities', async () => {
    const calls = { n: 0 };
    const catalog = new OpenRouterModelCatalog({
      fetchImpl: fetchOf(calls, () => new Response(JSON.stringify(LIST))),
    });
    expect(await catalog.acceptsImages('test/voit')).toBe(true);
    expect(await catalog.acceptsImages('test/texte')).toBe(false);
    expect(await catalog.acceptsImages('test/sans-architecture')).toBe(false);
    expect(await catalog.acceptsImages('test/inconnu')).toBeNull();
    expect(calls.n).toBe(1);
  });

  it('garde la liste en mémoire pendant la durée prévue, puis la relit', async () => {
    const calls = { n: 0 };
    let now = 0;
    const catalog = new OpenRouterModelCatalog({
      ttlMs: 1000,
      now: () => now,
      fetchImpl: fetchOf(calls, () => new Response(JSON.stringify(LIST))),
    });
    await catalog.acceptsImages('test/voit');
    now = 999;
    await catalog.acceptsImages('test/voit');
    expect(calls.n).toBe(1);
    now = 1500;
    await catalog.acceptsImages('test/voit');
    expect(calls.n).toBe(2);
  });

  it('liste indisponible ou illisible : « inconnu » (null), jamais une erreur', async () => {
    const calls = { n: 0 };
    for (const impl of [
      () => new Response('', { status: 500 }),
      () => new Response('pas du json'),
      () => new Response('{"data":"x"}'),
    ]) {
      const catalog = new OpenRouterModelCatalog({ fetchImpl: fetchOf(calls, impl) });
      expect(await catalog.acceptsImages('test/voit')).toBeNull();
    }
    const failing = new OpenRouterModelCatalog({
      fetchImpl: () => Promise.reject(new Error('réseau')),
    });
    expect(await failing.acceptsImages('test/voit')).toBeNull();
  });

  it('une liste déjà chargée reste utilisable si la relecture échoue', async () => {
    let ok = true;
    let now = 0;
    const calls = { n: 0 };
    const catalog = new OpenRouterModelCatalog({
      ttlMs: 10,
      now: () => now,
      fetchImpl: fetchOf(calls, () =>
        ok ? new Response(JSON.stringify(LIST)) : new Response('', { status: 503 }),
      ),
    });
    expect(await catalog.acceptsImages('test/voit')).toBe(true);
    ok = false;
    now = 100;
    expect(await catalog.acceptsImages('test/voit')).toBe(true);
  });
});

describe('StaticModelCatalog', () => {
  it('répond selon la table, sinon la valeur par défaut', async () => {
    const catalog = new StaticModelCatalog({ 'a/b': true, 'c/d': false });
    expect(await catalog.acceptsImages('a/b')).toBe(true);
    expect(await catalog.acceptsImages('c/d')).toBe(false);
    expect(await catalog.acceptsImages('x/y')).toBeNull();
    expect(await new StaticModelCatalog({}, true).acceptsImages('x/y')).toBe(true);
  });
});
