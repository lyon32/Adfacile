// Rafraîchissement des taux de change : lit la source (ExchangeRate-API, accès ouvert) et écrit `exchange_rates` pour les
// monnaies des pays actifs. Tâche planifiée (jobs/), sans utilisateur : un `ServiceCtx` suffit.
//
// Règles (S15b) :
//  - la source n'est appelée que si la prochaine mise à jour annoncée est passée (une publication par jour, HTTP 429 puis
//    blocage de 20 minutes si l'on insiste) ; jamais de boucle de nouveaux essais : une erreur est journalisée et on attend
//    la prochaine exécution ;
//  - un échec laisse les anciens taux en place (ils seront ignorés au-delà de 48 h : voir `freshness.ts`) ;
//  - aucun taux inventé : une monnaie absente de la réponse est signalée, un taux aberrant (zéro, négatif, NaN, infini,
//    arrondi à zéro, hors de la colonne, variation de plus de 50 % par publication) est rejeté et journalisé ;
//  - idempotente : un taux n'est écrit qu'une fois par publication du fournisseur (index unique, concurrence sûre) ;
//  - les taux ne sont JAMAIS exposés tels quels (les conditions du fournisseur interdisent de les redistribuer).
import { AppError } from '@pubeka/contracts';
import { createLogger, isKnownCurrency } from '@pubeka/shared';
import type { ServiceCtx } from '../context';
import { FxSourceError, type FxRateSource } from './fx-source';
import { isFxFresh } from './freshness';

/** Variation maximale acceptée d'une publication à l'autre (0,5 = 50 %). Au-delà, le taux est rejeté et journalisé. */
export const MAX_DAILY_VARIATION = 0.5;
/** Plus grande valeur de la colonne `numeric(12,4)`, en dix-millièmes. */
const MAX_SCALED = 999_999_999_999n;
const UNIQUE_VIOLATION = '23505';

export interface FxLogger {
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
}

export interface RefreshDeps {
  svc: ServiceCtx['svc'];
  source: FxRateSource;
  now: () => Date;
  logger?: FxLogger;
}

export type RefreshStatus = 'refreshed' | 'not_due' | 'failed' | 'nothing_to_do';

export interface RefreshReport {
  status: RefreshStatus;
  /** Monnaies dont un nouveau taux a été écrit. */
  written: string[];
  /** Monnaies déjà enregistrées pour cette publication du fournisseur. */
  unchanged: string[];
  /** Monnaies absentes de la réponse du fournisseur : aucun taux n'est inventé. */
  missing: string[];
  rejected: { currency: string; reason: 'invalid_rate' | 'variation_too_large' }[];
  /** Code de l'erreur de la source quand `status` vaut `failed`. */
  error?: string;
}

const defaultLogger = createLogger({ base: { module: 'fx' } });

function fail(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

/**
 * Arrondit un taux au dix-millième (demi vers le haut) SANS passer par un calcul flottant : on travaille sur l'écriture
 * décimale la plus courte du nombre (« 583.48355 » donne 583.4836). `null` si le taux est inutilisable.
 */
function roundRate(rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const text = rate.toString();
  if (text.includes('e')) return null; // notation scientifique : trop petit ou trop grand pour la colonne
  const [whole = '0', fraction = ''] = text.split('.');
  const padded = fraction.padEnd(5, '0');
  let scaled = BigInt(`${whole}${padded.slice(0, 4)}`);
  if (padded.charAt(4) >= '5') scaled += 1n;
  if (scaled < 1n || scaled > MAX_SCALED) return null;
  return Number(scaled) / 10_000;
}

interface StoredRate {
  quote: string;
  rate: number;
  provider_updated_at: string | null;
  next_update_at: string | null;
  fetched_at: string;
}

export async function refreshExchangeRates(deps: RefreshDeps): Promise<RefreshReport> {
  const { svc, source, now } = deps;
  const logger = deps.logger ?? defaultLogger;
  const report: RefreshReport = {
    status: 'refreshed',
    written: [],
    unchanged: [],
    missing: [],
    rejected: [],
  };

  // 1. Monnaies à couvrir : celles des pays actifs, prises en charge, sauf le dollar (la base).
  const countries = await svc.from('countries').select('currency').eq('active', true);
  if (countries.error !== null) throw fail(countries.error);
  const currencies = [
    ...new Set(
      countries.data.map((row) => row.currency).filter((c) => c !== 'USD' && isKnownCurrency(c)),
    ),
  ].sort();
  if (currencies.length === 0) {
    logger.warn('Aucun pays actif : rien à rafraîchir');
    return { ...report, status: 'nothing_to_do' };
  }

  // 2. Dernier taux connu de chaque monnaie, et la prochaine mise à jour annoncée.
  const history = await svc
    .from('exchange_rates')
    .select('quote, rate, provider_updated_at, next_update_at, fetched_at')
    .eq('base', 'USD')
    .in('quote', currencies)
    .order('fetched_at', { ascending: false });
  if (history.error !== null) throw fail(history.error);
  const latest = new Map<string, StoredRate>();
  for (const row of history.data as StoredRate[]) {
    if (!latest.has(row.quote.trim())) latest.set(row.quote.trim(), row);
  }
  const nextTimes = [...latest.values()]
    .map((row) => (row.next_update_at === null ? Number.NaN : Date.parse(row.next_update_at)))
    .filter((t) => !Number.isNaN(t));
  if (nextTimes.length > 0 && Math.max(...nextTimes) > now().getTime()) {
    logger.info('Taux à jour : la prochaine mise à jour annoncée n’est pas passée', {
      nextUpdateAt: new Date(Math.max(...nextTimes)).toISOString(),
    });
    return { ...report, status: 'not_due' };
  }

  // 3. Un seul appel, jamais relancé : une erreur est journalisée et les anciens taux restent.
  let snapshot;
  try {
    snapshot = await source.fetchLatest();
  } catch (error) {
    const code = error instanceof FxSourceError ? error.code : 'unknown';
    logger.error('Rafraîchissement des taux de change impossible', {
      code,
      status: error instanceof FxSourceError ? error.status : undefined,
      message: error instanceof FxSourceError ? error.message : undefined,
    });
    return { ...report, status: 'failed', error: code };
  }
  if (snapshot.endOfLifeAt !== null) {
    logger.warn('Le fournisseur annonce la fin de service du point d’accès', {
      endOfLifeAt: snapshot.endOfLifeAt.toISOString(),
    });
  }

  // 4. Validation, devise par devise.
  const fetchedAt = now().toISOString();
  const publishedMs = snapshot.providerUpdatedAt.getTime();
  const rows: {
    base: 'USD';
    quote: string;
    rate: number;
    source: 'exchangerate-api';
    fetched_at: string;
    provider_updated_at: string;
    next_update_at: string | null;
  }[] = [];
  for (const currency of currencies) {
    const previous = latest.get(currency);
    if (
      previous?.provider_updated_at !== undefined &&
      previous.provider_updated_at !== null &&
      Date.parse(previous.provider_updated_at) === publishedMs
    ) {
      report.unchanged.push(currency);
      continue;
    }
    const provided = snapshot.rates.get(currency);
    if (provided === undefined) {
      report.missing.push(currency);
      logger.warn('Monnaie absente de la réponse du fournisseur : aucun taux écrit', { currency });
      continue;
    }
    const rate = roundRate(provided);
    if (rate === null) {
      report.rejected.push({ currency, reason: 'invalid_rate' });
      logger.error('Taux de change rejeté : valeur inutilisable', { currency, provided });
      continue;
    }
    if (previous !== undefined && isFxFresh(previous, now())) {
      const variation = Math.abs(rate / previous.rate - 1);
      if (variation > MAX_DAILY_VARIATION) {
        report.rejected.push({ currency, reason: 'variation_too_large' });
        logger.error('Taux de change rejeté : variation trop forte', {
          currency,
          previous: previous.rate,
          provided: rate,
          variation,
        });
        continue;
      }
    }
    rows.push({
      base: 'USD',
      quote: currency,
      rate,
      source: source.name,
      fetched_at: fetchedAt,
      provider_updated_at: snapshot.providerUpdatedAt.toISOString(),
      next_update_at: snapshot.nextUpdateAt?.toISOString() ?? null,
    });
  }

  // 5. Écriture. Une violation d'unicité = un autre exemplaire de la tâche a déjà écrit cette publication : sans conséquence.
  if (rows.length > 0) {
    const inserted = await svc.from('exchange_rates').insert(rows);
    if (inserted.error === null) {
      report.written.push(...rows.map((r) => r.quote));
    } else if (inserted.error.code === UNIQUE_VIOLATION) {
      for (const row of rows) {
        const one = await svc.from('exchange_rates').insert(row);
        if (one.error === null) report.written.push(row.quote);
        else if (one.error.code === UNIQUE_VIOLATION) report.unchanged.push(row.quote);
        else throw fail(one.error);
      }
    } else {
      throw fail(inserted.error);
    }
  }
  logger.info('Taux de change rafraîchis', {
    written: report.written,
    unchanged: report.unchanged,
    missing: report.missing,
    rejected: report.rejected,
    providerUpdatedAt: snapshot.providerUpdatedAt.toISOString(),
    nextUpdateAt: snapshot.nextUpdateAt?.toISOString() ?? null,
  });
  return report;
}
