// Monnaie du compte publicitaire et taux pour convertir le budget (EC-META-11). Meta exprime les budgets dans la monnaie du
// COMPTE ; Pubeka garde des centimes de dollar. Le taux est celui de la table `exchange_rates` (rafraîchie par la tâche
// planifiée), jamais un taux codé en dur ; plus vieux que 48 h il n'est plus utilisé (même règle que l'affichage des coûts).
import { AppError } from '@pubeka/contracts';
import type { DbClient } from '@pubeka/db';
import { isMetaSupportedCurrency, type AccountCurrency } from '@pubeka/platforms';
import { isFxFresh } from '../../fx/freshness';

function conflict(reason: string, currency: string | null): AppError {
  return new AppError('conflict', { meta: { reason, ...(currency === null ? {} : { currency }) } });
}

/**
 * Monnaie du compte avec son taux frais. Refus nets, avant toute dépense :
 *  - monnaie jamais lue chez Meta : `conflict` (`account_currency_unknown`) ;
 *  - monnaie absente de la table de Meta (franc CFA…) : `validation_failed` sur `ad_account.currency` ;
 *  - hors dollar sans taux frais : `conflict` (`fx_not_available`).
 */
export async function loadAccountCurrency(
  reader: DbClient,
  code: string | null,
  now: Date,
): Promise<AccountCurrency> {
  if (code === null) throw conflict('account_currency_unknown', null);
  let account: AccountCurrency = { code };
  if (code !== 'USD') {
    const rows = await reader
      .from('exchange_rates')
      .select('rate, fetched_at, provider_updated_at')
      .eq('base', 'USD')
      .eq('quote', code)
      .order('fetched_at', { ascending: false })
      .limit(1);
    if (rows.error !== null) throw new AppError('internal_error', { cause: rows.error });
    const latest = rows.data[0];
    if (latest === undefined || !isFxFresh(latest, now)) {
      // Une monnaie que Meta ne connaît pas doit être dite telle quelle plutôt que « taux indisponible ».
      assertSupportedByMeta({ code });
      throw conflict('fx_not_available', code);
    }
    account = { code, perUsd: latest.rate };
  }
  assertSupportedByMeta(account);
  return account;
}

/** Liste officielle des monnaies des comptes publicitaires (Marketing API, « Currency codes »), relevée le 18/10/2026. */
export const META_CURRENCIES_URL = 'https://developers.facebook.com/docs/marketing-api/currencies';

/** Le guide de l'écran qui explique comment obtenir un compte dans une monnaie acceptée. */
export const CURRENCY_GUIDE_SLUG = 'ad-account-currency';

/** Refus net : Meta n'accepte pas cette monnaie pour un compte publicitaire. Le message renvoie vers le guide et la liste officielle. */
export function unsupportedCurrencyError(code: string, cause?: unknown): AppError {
  const named = code === '' ? 'inconnue' : code;
  return new AppError('validation_failed', {
    errors: [
      {
        field: 'ad_account.currency',
        code: 'unsupported_by_meta',
        message:
          `Meta n’accepte pas la monnaie ${named} pour un compte publicitaire, d’après sa documentation officielle (${META_CURRENCIES_URL}, relevée le 18/10/2026). ` +
          'Utilise un compte publicitaire dans une monnaie acceptée, par exemple le dollar américain (USD) : le guide explique comment faire.',
      },
    ],
    meta: { reason: 'ad_account_currency_unsupported', currency: code, guide: CURRENCY_GUIDE_SLUG },
    ...(cause === undefined ? {} : { cause }),
  });
}

/** Vérifie, sans appeler Meta, que Meta connaît la monnaie du compte (sinon `validation_failed` sur le champ concerné). */
function assertSupportedByMeta(account: AccountCurrency): void {
  if (!isMetaSupportedCurrency(account.code)) throw unsupportedCurrencyError(account.code);
}
