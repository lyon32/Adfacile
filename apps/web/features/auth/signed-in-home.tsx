// Accueil provisoire de l'utilisateur connecté (S04) : salutation selon le fuseau déclaré
// (TR-PLT-04), déconnexion, et garde d'inactivité (TR-SEC-13). Remplacé par la coque en S09.
import type { ReactNode } from 'react';
import { getProfilePrefs, requireUser } from '../../server/auth/session';
import { greetingKey } from './greeting';
import { IdleLogout } from './idle-logout';
import { translator } from './messages';
import { SignOutButton } from './sign-out-button';
import styles from './auth.module.css';

export async function SignedInHome(): Promise<ReactNode> {
  const user = await requireUser();
  const prefs = await getProfilePrefs(user.id);
  const locale = prefs?.uiLanguage ?? 'fr';
  const t = translator(locale);
  // Fuseau du profil (Africa/Douala par défaut en base) : jamais celui de l'appareil (EC-TIME-01).
  const greeting = t(greetingKey(new Date(), prefs?.timezone ?? 'Africa/Douala'));
  return (
    <main data-zone="console" className={styles.home}>
      <h1>{greeting}</h1>
      <p>{user.email}</p>
      <SignOutButton locale={locale} />
      <IdleLogout locale={locale} />
    </main>
  );
}
