// Première configuration `/bienvenue/{etape}` (APPFLOW §5).
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { parseNotice } from '../../../../../features/meta-connection/notice';
import { OnboardingFlow } from '../../../../../features/onboarding/onboarding-flow';
import { parseStep } from '../../../../../features/onboarding/steps';
import { loadCountries } from '../../../../../features/shell/countries';
import { loadViewer } from '../../../../../features/shell/viewer';

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ etape: string }>;
  searchParams: Promise<{ meta?: string; reason?: string }>;
}): Promise<ReactNode> {
  const step = parseStep((await params).etape);
  const viewer = await loadViewer();
  if (step === null || viewer === null) notFound();
  const { me, workspace } = viewer;
  const query = await searchParams;

  const countries = await loadCountries(me.ui_language);

  return (
    <OnboardingFlow
      step={step}
      countries={countries}
      workspace={workspace === null ? null : { id: workspace.id, role: workspace.role }}
      notice={parseNotice(query.meta, query.reason)}
      profile={{
        countryCode: me.country_code,
        city: me.city,
        currency: me.currency_display,
        locale: me.ui_language,
      }}
    />
  );
}
