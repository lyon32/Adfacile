// Monnaie du compte publicitaire et taux pour convertir le budget (EC-META-11). Meta exprime les budgets dans la monnaie du
// COMPTE ; Pubeka garde des centimes de dollar. Le taux est celui de la table `exchange_rates` (rafraîchie par la tâche
// planifiée), jamais un taux codé en dur ; plus vieux que 48 h il n'est plus utilisé (même règle que l'affichage des coûts).
import { AppError } from '@pubeka/contracts';
import type { DbClient } from '@pubeka/db';
import { metaCurrencyOffset, toAppError, type AccountCurrency } from '@pubeka/platforms';
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

/** Vérifie, sans appeler Meta, que Meta connaît la monnaie du compte (sinon `validation_failed` sur le champ concerné). */
function assertSupportedByMeta(account: AccountCurrency): void {
  try {
    metaCurrencyOffset(account.code);
  } catch (error) {
    const converted = toAppError(error);
    throw new AppError('validation_failed', {
      errors: (converted.opts.errors ?? []).map((e) => ({ ...e, field: 'ad_account.currency' })),
      cause: error,
    });
  }
}
