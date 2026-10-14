'use client';
// Changement de langue ou de thème : enregistré dans le profil (serveur) puis recopié dans un
// cookie pour le premier affichage (LLD §7.4). Appelé sur un clic, jamais dans un useEffect.
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { LOCALE_COOKIE, THEME_COOKIE, type Locale, type Theme } from '@pubeka/i18n';
import { apiFetch } from '../../lib/api';

const MeSchema = z.looseObject({
  ui_language: z.enum(['fr', 'en']),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

const ONE_YEAR_S = 31_536_000;

export function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${String(ONE_YEAR_S)}; samesite=lax`;
}

export interface MePatch {
  ui_language?: Locale;
  theme?: Theme;
  country_code?: string;
  city?: string;
  currency_display?: 'XAF' | 'XOF';
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export function useUpdateMe() {
  const router = useRouter();
  return useMutation({
    mutationFn: (patch: MePatch) => apiFetch('/me', MeSchema, { method: 'PATCH', body: patch }),
    onSuccess: (me) => {
      writeCookie(LOCALE_COOKIE, me.ui_language);
      if (me.theme !== undefined) writeCookie(THEME_COOKIE, me.theme);
      router.refresh();
    },
  });
}
