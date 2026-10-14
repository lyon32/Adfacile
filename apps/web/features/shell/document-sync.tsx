'use client';
// Pose la langue et le thème sur <html> : la racine de l'application est partagée avec le site
// public (statique) et ne peut pas les connaître. « Système » suit le réglage de l'appareil.
import { useEffect } from 'react';
import type { Locale, Theme } from '@pubeka/i18n';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

export function DocumentSync({ locale, theme }: { locale: Locale; theme: Theme }): null {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = (): void => {
      document.documentElement.dataset.theme = resolveTheme(theme, media.matches);
    };
    apply();
    if (theme !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [theme]);

  return null;
}
