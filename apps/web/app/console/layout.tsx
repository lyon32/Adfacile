// Racine de l'application (app.pubeka.com) : textes (next-intl), requêtes (TanStack Query),
// adresse (nuqs), langue et thème du document.
import { THEME_COOKIE, isTheme } from '@pubeka/i18n';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DocumentSync } from '../../features/shell/document-sync';
import { loadViewer } from '../../features/shell/viewer';
import { Providers } from '../../lib/providers';

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const [locale, viewer, store] = await Promise.all([getLocale(), loadViewer(), cookies()]);
  const cookieTheme = store.get(THEME_COOKIE)?.value;
  // Profil d'abord (source de vérité), puis cookie des écrans d'accès, puis clair par défaut.
  const theme = viewer?.me.theme ?? (isTheme(cookieTheme) ? cookieTheme : 'light');
  return (
    <NextIntlClientProvider>
      <Providers>
        <DocumentSync locale={locale === 'en' ? 'en' : 'fr'} theme={theme} />
        {/* Premier affichage : le thème sombre est posé par le serveur, sans clignotement. */}
        <div data-theme={theme === 'dark' ? 'dark' : 'light'} className="bg-bg text-ink min-h-dvh">
          {children}
        </div>
      </Providers>
    </NextIntlClientProvider>
  );
}
