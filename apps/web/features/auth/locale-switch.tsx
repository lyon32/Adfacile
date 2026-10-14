'use client';
// Langue des écrans d'accès : choix gardé dans le cookie NEXT_LOCALE (pas encore de profil).
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@pubeka/i18n';
import { cn } from '@pubeka/ui';
import { writeCookie } from '../shell/use-update-me';

const NAMES: Record<Locale, string> = { fr: 'Français', en: 'English' };

export function LocaleSwitch(): ReactNode {
  const current = useLocale();
  const router = useRouter();
  return (
    <div role="group" aria-label="Langue / Language" className="flex gap-1">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          aria-label={NAMES[locale]}
          onClick={() => {
            writeCookie(LOCALE_COOKIE, locale);
            router.refresh();
          }}
          className={cn(
            'min-h-11 min-w-11 rounded-md px-3 text-sm font-bold uppercase',
            locale === current ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
