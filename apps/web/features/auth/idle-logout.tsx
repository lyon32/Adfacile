'use client';
// Fenêtre « Tu es toujours là ? » et déconnexion après 10 minutes (TR-SEC-13). Les brouillons
// restent sur l'appareil ; une tâche serveur en cours n'est pas interrompue (EC-AUTH-03).
import type { ReactNode } from 'react';
import { idleSignInPath } from './idle';
import { translator, type Locale } from './messages';
import { useIdleLogout } from './use-idle-logout';
import { postAuth } from './post-auth';
import styles from './auth.module.css';

export function IdleLogout({ locale }: { locale: Locale }): ReactNode {
  const t = translator(locale);
  const { phase, stayConnected } = useIdleLogout({
    onExpire: () => {
      const target = idleSignInPath(window.location.pathname + window.location.search);
      void postAuth('/auth/sign-out', {}).finally(() => {
        window.location.assign(target);
      });
    },
  });
  if (phase.kind !== 'warning') return null;
  return (
    <div className={styles.backdrop}>
      <dialog
        open
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
        className={styles.dialog}
      >
        <h2 id="idle-title" className={styles.dialogTitle}>
          {t('auth.idle.title')}
        </h2>
        <p id="idle-body" aria-live="polite">
          {t('auth.idle.body', { seconds: phase.secondsLeft })}
        </p>
        <button type="button" className={styles.primary} onClick={stayConnected} autoFocus>
          {t('auth.idle.stay')}
        </button>
      </dialog>
    </div>
  );
}
