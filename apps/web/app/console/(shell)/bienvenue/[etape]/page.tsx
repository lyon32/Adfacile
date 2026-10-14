// Première configuration `/bienvenue/{etape}` (APPFLOW §5).
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { OnboardingFlow } from '../../../../../features/onboarding/onboarding-flow';
import { parseStep } from '../../../../../features/onboarding/steps';
import { loadCountries } from '../../../../../features/shell/countries';
import { loadViewer } from '../../../../../features/shell/viewer';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ etape: string }>;
}): Promise<ReactNode> {
  const step = parseStep((await params).etape);
  const viewer = await loadViewer();
  if (step === null || viewer === null) notFound();
  const { me } = viewer;

  const countries = await loadCountries(me.ui_language);

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
