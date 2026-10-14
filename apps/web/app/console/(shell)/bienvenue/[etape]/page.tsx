// Première configuration `/bienvenue/{etape}` (APPFLOW §5).
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  OnboardingFlow,
  type CountryOption,
} from '../../../../../features/onboarding/onboarding-flow';
import { parseStep } from '../../../../../features/onboarding/steps';
import { loadViewer } from '../../../../../features/shell/viewer';
import { createRequestAuthClient } from '../../../../../server/auth/supabase';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ etape: string }>;
}): Promise<ReactNode> {
  const step = parseStep((await params).etape);
  const viewer = await loadViewer();
  if (step === null || viewer === null) notFound();
  const { me } = viewer;

  // Pays actifs de la zone franc CFA (lecture ouverte aux connectés), triés dans la langue.
  const client = await createRequestAuthClient();
  const { data } = await client
    .from('countries')
    .select('code, name_fr, name_en, currency')
    .eq('active', true);
  const countries: CountryOption[] = (data ?? [])
    .map((row) => ({
      code: row.code,
      name: me.ui_language === 'en' ? row.name_en : row.name_fr,
      currency: row.currency === 'XOF' ? ('XOF' as const) : ('XAF' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, me.ui_language));

  return (
    <OnboardingFlow
      step={step}
      countries={countries}
      profile={{
        countryCode: me.country_code,
        city: me.city,
        currency: me.currency_display,
        locale: me.ui_language,
      }}
    />
  );
}
