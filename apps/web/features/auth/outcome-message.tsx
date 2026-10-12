// Message affiché pour une issue d'action (jamais le texte renvoyé par Supabase).
import type { ReactNode } from 'react';
import type { MessageKey, Translate } from './messages';
import type { Outcome } from './post-auth';
import styles from './auth.module.css';

const OUTCOME_KEYS: Record<Exclude<Outcome, 'ok'>, MessageKey> = {
  invalid_credentials: 'auth.errors.invalid_credentials',
  locked: 'auth.errors.locked',
  email_not_confirmed: 'auth.errors.email_not_confirmed',
  captcha_failed: 'auth.errors.captcha_failed',
  email_taken: 'auth.errors.email_taken',
  weak_password: 'auth.errors.weak_password',
  rate_limited: 'auth.errors.rate_limited',
  link_expired: 'auth.errors.link_expired',
  unavailable: 'auth.errors.unavailable',
};

export function OutcomeMessage({
  outcome,
  t,
}: {
  outcome: Outcome | null;
  t: Translate;
}): ReactNode {
  if (outcome === null || outcome === 'ok') return null;
  return (
    <p role="alert" className={styles.alert}>
      {t(OUTCOME_KEYS[outcome])}{' '}
      {outcome === 'email_taken' && (
        <a className={styles.link} href="/connexion">
          {t('auth.errors.email_taken_link')}
        </a>
      )}
      {outcome === 'link_expired' && (
        <a className={styles.link} href="/mot-de-passe-oublie">
          {t('auth.errors.link_expired_action')}
        </a>
      )}
    </p>
  );
}
