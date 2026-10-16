// Données dont dépend le coût d'une campagne : pays de facturation, TVA du pays, taux de change.
// La TVA (`vat_rates`) et le change (`exchange_rates`) sont des DONNÉES de l'administration (S31) : on les lit, on ne les
// invente jamais. Table vide, pays inconnu : la valeur est `null` et `campaignCost` le dit (statut explicite).
//
// Pays de la TVA : PRD §9.3 « selon le pays de facturation (Sold To) du compte publicitaire » → `ad_accounts.vat_country`
// du compte actif ; tant que rien ne le renseigne (aucun écrivain avant S16), repli sur le pays du propriétaire de
// l'espace (APPFLOW §14 : « changer de pays recalcule fuseau et TVA »). À confirmer par la personne.
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../context';
import type { CostFxInput, FcfaCurrency } from './cost';

export interface CostContext {
  vat: { country: string | null; rate: number | null };
  fx: CostFxInput | null;
}

type Scope = Pick<MemberCtx, 'svc' | 'now' | 'workspace'>;

function fail(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

function isCurrency(value: unknown): value is FcfaCurrency {
  return value === 'XAF' || value === 'XOF';
}

async function billingCountry(scope: Scope): Promise<string | null> {
  const { svc, workspace } = scope;
  const account = await svc
    .from('ad_accounts')
    .select('vat_country')
    .eq('workspace_id', workspace.id)
    .eq('is_active', true)
    .maybeSingle();
  if (account.error !== null) throw fail(account.error);
  const accountCountry = account.data?.vat_country ?? null;
  if (accountCountry !== null) return accountCountry;

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
  if (country === null) return { vat: { country: null, rate: null }, fx: null };

  const countryRow = await svc
    .from('countries')
    .select('currency')
    .eq('code', country)
    .maybeSingle();
  if (countryRow.error !== null) throw fail(countryRow.error);
  const currency = countryRow.data?.currency ?? null;
  // Pays absent de la table (ou monnaie non FCFA) : ni TVA ni change connus, rien n'est supposé.
  if (!isCurrency(currency)) return { vat: { country, rate: null }, fx: null };

  const today = scope.now().toISOString().slice(0, 10);
  const vatRows = await svc
    .from('vat_rates')
    .select('rate')
    .eq('country_code', country)
    .lte('valid_from', today)
    .order('valid_from', { ascending: false })
    .limit(1);
  if (vatRows.error !== null) throw fail(vatRows.error);

  const fxRows = await svc
    .from('exchange_rates')
    .select('rate, source, fetched_at')
    .eq('base', 'USD')
    .eq('quote', currency)
    .order('fetched_at', { ascending: false })
    .limit(1);
  if (fxRows.error !== null) throw fail(fxRows.error);

  const vat = vatRows.data[0];
  const fx = fxRows.data[0];
  const source =
    fx === undefined
      ? undefined
      : (['saspay', 'fallback', 'manual'] as const).find((s) => s === fx.source);
  if (fx !== undefined && source === undefined) throw new AppError('internal_error');
  return {
    vat: { country, rate: vat === undefined ? null : vat.rate },
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
