import 'server-only';
// Langue des écrans d'accès lue dans la requête (cookie, puis navigateur).
import { cookies, headers } from 'next/headers';
import { pickLocale, type Locale } from './messages';

export async function requestLocale(): Promise<Locale> {
  const [store, h] = await Promise.all([cookies(), headers()]);
  return pickLocale(store.get('NEXT_LOCALE')?.value, h.get('accept-language'));
}
