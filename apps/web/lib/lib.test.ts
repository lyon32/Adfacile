import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useUiStore } from '../stores/ui-store';
import { ApiError, apiFetch } from './api';
import { getQueryClient } from './query-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch (API_SPEC §3)', () => {
  it('valide la réponse avec le schéma', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ id: 'a' })));
    await expect(apiFetch('/me', z.object({ id: z.string() }))).resolves.toEqual({ id: 'a' });
  });

  it('refuse une réponse qui ne respecte pas le schéma', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ id: 1 })));
    await expect(apiFetch('/me', z.object({ id: z.string() }))).rejects.toThrow();
  });

  it('transforme un Problem Details en ApiError avec son code', async () => {
    const problem = {
      type: 'x',
      title: 'Forbidden',
      status: 403,
      code: 'forbidden',
      request_id: 'r',
    };
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(problem, { status: 403 })));
    const error = await apiFetch('/me', z.unknown()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('une panne sans corps JSON donne un code inconnu, et un 204 passe par le schéma', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('oups', { status: 502 })));
    await expect(apiFetch('/me', z.unknown())).rejects.toMatchObject({
      status: 502,
      code: 'unknown',
    });
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })));
    await expect(
      apiFetch('/x', z.undefined(), { method: 'PUT', body: { a: 1 } }),
    ).resolves.toBeUndefined();
  });

  it('envoie le corps en JSON', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({})));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/me', z.object({}), { method: 'PATCH', body: { theme: 'dark' } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me',
      expect.objectContaining({ method: 'PATCH', body: '{"theme":"dark"}' }),
    );
  });
});

describe('TanStack Query (LLD §7.2)', () => {
  it('ne réessaie pas une erreur 4xx, réessaie une panne réseau deux fois au plus', () => {
    const retry = getQueryClient().getDefaultOptions().queries?.retry;
    if (typeof retry !== 'function') throw new Error('retry attendu');
    expect(retry(0, new ApiError(404, null))).toBe(false);
    expect(retry(0, new Error('réseau'))).toBe(true);
    expect(retry(2, new Error('réseau'))).toBe(false);
  });
});

describe('ui-store (LLD §7.4)', () => {
  it('garde la plage des statistiques et l’état de la barre latérale', () => {
    useUiStore.getState().setStatsChartRange('30d');
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState()).toMatchObject({ statsChartRange: '30d', sidebarCollapsed: true });
  });
});
