'use client';
import type { ReactNode } from 'react';
import { translator, type Locale } from './messages';
import { postAuth } from './post-auth';
import styles from './auth.module.css';

export function SignOutButton({ locale }: { locale: Locale }): ReactNode {
  const t = translator(locale);
  return (
    <button
      type="button"
      className={styles.secondary}
      onClick={() => {
        void postAuth('/auth/sign-out', {}).finally(() => {
          window.location.assign(new URL('/connexion', window.location.origin).href);
        });
      }}
    >
      {t('auth.home.sign_out')}
    </button>
  );
}
