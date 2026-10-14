// Fournisseur de textes pour les tests de composants (next-intl, comme en production).
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { messagesFor, type Locale } from '@pubeka/i18n';

export function renderIntl(ui: ReactNode, locale: Locale = 'fr'): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      {ui}
    </NextIntlClientProvider>,
  );
}
