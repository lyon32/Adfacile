import 'server-only';
// Pays actifs (les 54 pays d'Afrique, chacun avec sa monnaie ; lecture ouverte aux connectés), triés dans la langue.
import type { Locale } from '@pubeka/i18n';
import { createRequestAuthClient } from '../../server/auth/supabase';

export interface CountryOption {
  code: string;
  name: string;
  /** Code ISO 4217 de la monnaie du pays. */
  currency: string;
}

export async function loadCountries(locale: Locale): Promise<CountryOption[]> {
  const client = await createRequestAuthClient();
  const { data } = await client
    .from('countries')
    .select('code, name_fr, name_en, currency')
    .eq('active', true);
  return (data ?? [])
    .map((row) => ({
      code: row.code,
      name: locale === 'en' ? row.name_en : row.name_fr,
      currency: row.currency,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
