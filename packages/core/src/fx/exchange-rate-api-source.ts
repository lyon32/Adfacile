// Source ExchangeRate-API, accès ouvert : GET https://open.er-api.com/v6/latest/USD
// Documentation officielle : https://www.exchangerate-api.com/docs/free · conditions : https://www.exchangerate-api.com/terms
//  - aucune clé d'API ;
//  - les taux ne changent qu'UNE fois par jour (la réponse annonce `time_next_update_unix`) ; HTTP 429 puis blocage de
//    20 minutes si l'on insiste : on n'insiste jamais (aucun nouvel essai ici, la tâche attend sa prochaine exécution) ;
//  - usage personnel ou commercial permis, mise en cache permise, REDISTRIBUTION interdite ; attribution obligatoire
//    (lien « Rates By Exchange Rate API » sur les pages qui affichent ces taux).
import { z } from 'zod';
import { FxSourceError, type FxRateSource, type FxSnapshot } from './fx-source';

export const EXCHANGE_RATE_API_URL = 'https://open.er-api.com/v6/latest/USD';
const TIMEOUT_MS = 10_000;

const SuccessSchema = z.object({
  result: z.literal('success'),
  base_code: z.literal('USD'),
  time_last_update_unix: z.number().int().positive(),
  time_next_update_unix: z.number().int().nonnegative().optional(),
  time_eol_unix: z.number().int().nonnegative().optional(),
  rates: z.record(z.string(), z.number()),
});
const ErrorSchema = z.object({ result: z.literal('error'), 'error-type': z.string().max(80) });
const CODE = /^[A-Z]{3}$/;

export interface ExchangeRateApiOptions {
  /** Injectable pour les tests : jamais d'appel réseau réel dans les tests ni la CI. */
  fetch?: typeof fetch;
}

function dateFromUnix(seconds: number | undefined): Date | null {
  return seconds === undefined || seconds === 0 ? null : new Date(seconds * 1000);
}

export class ExchangeRateApiSource implements FxRateSource {
  readonly name = 'exchangerate-api' as const;
  private readonly doFetch: typeof fetch;

  constructor(options: ExchangeRateApiOptions = {}) {
    this.doFetch = options.fetch ?? fetch;
  }

  async fetchLatest(): Promise<FxSnapshot> {
    let response: Response;
    try {
      response = await this.doFetch(EXCHANGE_RATE_API_URL, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new FxSourceError('unavailable', 'Source des taux injoignable', undefined);
    }
    if (response.status === 429) {
      throw new FxSourceError('rate_limited', 'Source des taux : trop de requêtes (429)', 429);
    }
    if (!response.ok) {
      throw new FxSourceError(
        'http_error',
        `Source des taux : HTTP ${String(response.status)}`,
        response.status,
      );
    }
    const payload: unknown = await response.json().catch(() => null);

    const failure = ErrorSchema.safeParse(payload);
    if (failure.success) {
      throw new FxSourceError('provider_error', `Source des taux : ${failure.data['error-type']}`);
    }
    const parsed = SuccessSchema.safeParse(payload);
    if (!parsed.success) {
      throw new FxSourceError('invalid_response', 'Source des taux : réponse inattendue');
    }
    const { rates, time_last_update_unix, time_next_update_unix, time_eol_unix } = parsed.data;
    const kept = new Map<string, number>();
    for (const [code, rate] of Object.entries(rates)) {
      if (CODE.test(code)) kept.set(code, rate);
    }
    if (kept.get('USD') !== 1) {
      throw new FxSourceError('invalid_response', 'Source des taux : USD doit valoir 1');
    }
    return {
      base: 'USD',
      rates: kept,
      providerUpdatedAt: new Date(time_last_update_unix * 1000),
      nextUpdateAt: dateFromUnix(time_next_update_unix),
      endOfLifeAt: dateFromUnix(time_eol_unix),
    };
  }
}
