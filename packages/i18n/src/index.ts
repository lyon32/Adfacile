// Module @pubeka/i18n : textes FR/EN (messages/fr.json, en.json) et choix de la langue (LLD §4).
// Les clés suivent `domaine.ecran.element` (CLAUDE.md §2) ; les fichiers sont imbriqués.
import en from '../messages/en.json';
import fr from '../messages/fr.json';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
/** Cookie de la langue, lu avant la connexion et pour le premier affichage (LLD §7.4). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
/** Cookie du thème, pour le premier affichage des écrans d'accès. */
export const THEME_COOKIE = 'pubeka-theme';
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export type Messages = typeof fr;

const CATALOGS: Record<Locale, Messages> = { fr, en };

export function messagesFor(locale: Locale): Messages {
  return CATALOGS[locale];
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

/** Langue du cookie, sinon celle du navigateur (première langue listée), sinon le français. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const first = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return isLocale(first) ? first : DEFAULT_LOCALE;
}
