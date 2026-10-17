// Données dont dépend le coût d'une campagne : pays du propriétaire de l'espace et taux de change.
// Le change (`exchange_rates`) est une DONNÉE rafraîchie par la tâche horaire (S15b) : on la lit, on ne l'invente jamais.
// Table vide, pays inconnu : la valeur est `null` et `campaignCost` le dit (statut explicite).
// TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision : `vat_rates` et `ad_accounts.vat_country`
// restent en base mais ne sont plus lues.
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../context';
import { isKnownCurrency } from '@pubeka/shared';
import { isFxFresh } from '../fx/freshness';
import type { CostFxInput, CostFxSource } from './cost';

export interface CostContext {
  fx: CostFxInput | null;
}

type Scope = Pick<MemberCtx, 'svc' | 'now' | 'workspace'>;

function fail(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

const FX_SOURCES: readonly CostFxSource[] = ['saspay', 'fallback', 'manual', 'exchangerate-api'];

/** Monnaie locale prise en charge (le dollar américain est la base, jamais une monnaie locale). */
function isLocalCurrency(value: unknown): value is string {
  return typeof value === 'string' && value !== 'USD' && isKnownCurrency(value);
}

async function billingCountry(scope: Scope): Promise<string | null> {
  const { svc, workspace } = scope;
  const owner = await svc
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspace.id)
    .maybeSingle();
  if (owner.error !== null) throw fail(owner.error);
  if (owner.data === null) return null;
  const profile = await svc
    .from('profiles')
    .select('country_code')
    .eq('id', owner.data.owner_id)
    .maybeSingle();
  if (profile.error !== null) throw fail(profile.error);
  return profile.data?.country_code ?? null;
}

export async function loadCostContext(scope: Scope): Promise<CostContext> {
  const { svc } = scope;
  const country = await billingCountry(scope);
  if (country === null) return { fx: null };

  const countryRow = await svc
    .from('countries')
    .select('currency')
    .eq('code', country)
    .maybeSingle();
  if (countryRow.error !== null) throw fail(countryRow.error);
  const currency = countryRow.data?.currency ?? null;
  // Pays absent de la table (ou monnaie non prise en charge) : change inconnu, rien n'est supposé.
  if (!isLocalCurrency(currency)) return { fx: null };

  const fxRows = await svc
    .from('exchange_rates')
    .select('rate, source, fetched_at, provider_updated_at')
    .eq('base', 'USD')
    .eq('quote', currency)
    .order('fetched_at', { ascending: false })
    .limit(1);
  if (fxRows.error !== null) throw fail(fxRows.error);

  // Un taux de plus de 48 h n'est plus utilisé (voir fx/freshness.ts) : l'écran affiche alors le dollar seul.
  const latestFx = fxRows.data[0];
  const fx = latestFx !== undefined && isFxFresh(latestFx, scope.now()) ? latestFx : undefined;
  const source =
    fx === undefined ? undefined : FX_SOURCES.find((candidate) => candidate === fx.source);
  if (fx !== undefined && source === undefined) throw new AppError('internal_error');
  return {
    fx:
      fx === undefined || source === undefined
        ? null
        : {
            rate: fx.rate,
            quote: currency,
            source,
            fetchedAt: new Date(fx.fetched_at).toISOString(),
          },
  };
}
