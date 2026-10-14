import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, messagesFor, pickLocale } from '@pubeka/i18n';
import { loadViewer } from '../features/shell/viewer';

// Langue : profil de l'utilisateur connecté (source de vérité), sinon cookie, sinon navigateur.
export default getRequestConfig(async () => {
  const viewer = await loadViewer().catch(() => null);
  const [store, h] = await Promise.all([cookies(), headers()]);
  const locale =
    viewer?.me.ui_language ?? pickLocale(store.get(LOCALE_COOKIE)?.value, h.get('accept-language'));
  return { locale, messages: messagesFor(locale) };
});
