// Source ExchangeRate-API (accès ouvert) : lecture et validation de la réponse, sans AUCUN appel réseau réel.
// Format vérifié sur la documentation officielle (https://www.exchangerate-api.com/docs/free) ; les taux ci-dessous sont des
// VALEURS D'ESSAI, pas des données du produit.
import { describe, expect, it } from 'vitest';
import { ExchangeRateApiSource, EXCHANGE_RATE_API_URL } from './exchange-rate-api-source';
import { FxSourceError } from './fx-source';

const LAST = 1_792_195_352; // 2026-10-17T00:02:32Z
const NEXT = 1_792_282_462; // 2026-10-18T00:14:22Z

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    result: 'success',
    provider: 'https://www.exchangerate-api.com',
    documentation: 'https://www.exchangerate-api.com/docs/free',
    terms_of_use: 'https://www.exchangerate-api.com/terms',
    time_last_update_unix: LAST,
    time_last_update_utc: 'Sat, 17 Oct 2026 00:02:32 +0000',
    time_next_update_unix: NEXT,
    time_next_update_utc: 'Sun, 18 Oct 2026 00:14:22 +0000',
    time_eol_unix: 0,
    base_code: 'USD',
    rates: { USD: 1, XAF: 600, NGN: 1500.5, TND: 3.1 },
    ...over,
  };
}

function fetchReturning(status: number, payload: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
    return Promise.resolve(
      new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
    );
  };
  return { fn, calls };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof FxSourceError ? error.code : `autre:${String(error)}`;
  }
}

describe('ExchangeRateApiSource', () => {
  it('lit les taux, la date de publication et la prochaine mise à jour annoncée', async () => {
    const { fn, calls } = fetchReturning(200, body());
    const snapshot = await new ExchangeRateApiSource({ fetch: fn }).fetchLatest();
    expect(snapshot.base).toBe('USD');
    expect(snapshot.providerUpdatedAt.toISOString()).toBe('2026-10-17T00:02:32.000Z');
    expect(snapshot.nextUpdateAt?.toISOString()).toBe('2026-10-18T00:14:22.000Z');
    expect(snapshot.endOfLifeAt).toBeNull();
    expect(snapshot.rates.get('NGN')).toBe(1500.5);
    expect(snapshot.rates.get('XAF')).toBe(600);
    expect(snapshot.rates.size).toBe(4);
    expect(calls).toHaveLength(1);
  });

  it('appelle l’adresse officielle en GET, sans clé, sans en-tête d’autorisation, sans suivre de redirection', async () => {
    const { fn, calls } = fetchReturning(200, body());
    await new ExchangeRateApiSource({ fetch: fn }).fetchLatest();
    expect(EXCHANGE_RATE_API_URL).toBe('https://open.er-api.com/v6/latest/USD');
    expect(calls[0]?.url).toBe(EXCHANGE_RATE_API_URL);
    expect(calls[0]?.init?.method).toBe('GET');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(calls[0]?.init?.redirect).toBe('error');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('time_eol_unix non nul : la date de fin de service est rendue', async () => {
    const { fn } = fetchReturning(200, body({ time_eol_unix: 1_800_000_000 }));
    const snapshot = await new ExchangeRateApiSource({ fetch: fn }).fetchLatest();
    expect(snapshot.endOfLifeAt?.toISOString()).toBe('2027-01-15T08:00:00.000Z');
  });

  it('ignore les codes qui ne sont pas de trois majuscules', async () => {
    const { fn } = fetchReturning(200, body({ rates: { USD: 1, XAF: 600, xaf: 5, 'X-Y': 3 } }));
    const snapshot = await new ExchangeRateApiSource({ fetch: fn }).fetchLatest();
    expect([...snapshot.rates.keys()].sort()).toEqual(['USD', 'XAF']);
  });

  it('HTTP 429 : rate_limited (blocage de 20 minutes), jamais de nouvel essai', async () => {
    const { fn, calls } = fetchReturning(429, '', { 'retry-after': '1200' });
    const error = await new ExchangeRateApiSource({ fetch: fn })
      .fetchLatest()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FxSourceError);
    expect(error).toMatchObject({ code: 'rate_limited', status: 429 });
    expect(calls).toHaveLength(1);
  });

  it('autre statut HTTP : http_error avec le statut', async () => {
    const { fn } = fetchReturning(503, 'indisponible');
    const error = await new ExchangeRateApiSource({ fetch: fn })
      .fetchLatest()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'http_error', status: 503 });
  });

  it('result = error : provider_error avec le type d’erreur du fournisseur', async () => {
    const { fn } = fetchReturning(200, { result: 'error', 'error-type': 'unsupported-code' });
    const error = await new ExchangeRateApiSource({ fetch: fn })
      .fetchLatest()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'provider_error' });
    expect((error as Error).message).toContain('unsupported-code');
  });

  it.each([
    ['JSON illisible', '<html>'],
    ['sans taux', body({ rates: undefined })],
    ['base autre que USD', body({ base_code: 'EUR' })],
    ['date de publication absente', body({ time_last_update_unix: undefined })],
    ['date de publication nulle', body({ time_last_update_unix: 0 })],
    ['taux en texte', body({ rates: { USD: 1, XAF: '600' } })],
    ['USD différent de 1', body({ rates: { USD: 2, XAF: 600 } })],
    ['résultat inconnu', body({ result: 'maybe' })],
  ])('réponse invalide (%s) : invalid_response', async (_name, payload) => {
    const { fn } = fetchReturning(200, payload);
    expect(await code(new ExchangeRateApiSource({ fetch: fn }).fetchLatest())).toBe(
      'invalid_response',
    );
  });

  it('réseau coupé ou délai dépassé : unavailable', async () => {
    const failing = (): Promise<Response> => Promise.reject(new TypeError('fetch failed'));
    expect(await code(new ExchangeRateApiSource({ fetch: failing }).fetchLatest())).toBe(
      'unavailable',
    );
  });

  it('le message d’erreur ne contient ni l’adresse complète ni le corps de la réponse', async () => {
    const { fn } = fetchReturning(500, 'SECRET-CORPS-DE-REPONSE');
    const error = await new ExchangeRateApiSource({ fetch: fn })
      .fetchLatest()
      .catch((e: unknown) => e);
    expect((error as Error).message).not.toContain('SECRET-CORPS-DE-REPONSE');
  });
});
