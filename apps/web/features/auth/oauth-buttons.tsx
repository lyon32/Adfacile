// Google et Apple (APPFLOW §4.1-4.2) : simples liens vers /auth/oauth/{fournisseur}, qui
// redirige vers Supabase Auth puis vers Google ou Apple.
import type { ReactNode } from 'react';
import type { Translate } from './messages';
import styles from './auth.module.css';

export function OAuthButtons({ t }: { t: Translate }): ReactNode {
  return (
    <>
      <div className={styles.providers}>
        <a className={styles.provider} href="/auth/oauth/google">
          {t('auth.common.google')}
        </a>
        <a className={styles.provider} href="/auth/oauth/apple">
          {t('auth.common.apple')}
        </a>
      </div>
      <div className={styles.divider}>{t('auth.common.or')}</div>
    </>
  );
}
