import 'server-only';
// Pays actifs de la zone franc CFA (lecture ouverte aux connectés), triés dans la langue.
import type { Locale } from '@pubeka/i18n';
import { createRequestAuthClient } from '../../server/auth/supabase';

export interface CountryOption {
  code: string;
  name: string;
  currency: 'XAF' | 'XOF';
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
      currency: row.currency === 'XOF' ? ('XOF' as const) : ('XAF' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
