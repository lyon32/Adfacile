'use client';
// Nouveau mot de passe, puis connexion automatique (APPFLOW §4.3, EC-AUTH-06).
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { PASSWORD_MIN_LENGTH } from '../../server/auth/schemas';
import { translator, type Locale } from './messages';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import styles from './auth.module.css';

export function NewPasswordForm({ locale }: { locale: Locale }): ReactNode {
  const t = translator(locale);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    const result = await postAuth('/auth/new-password', { password });
    setPending(false);
    if (result === 'ok') window.location.assign(new URL('/', window.location.origin).href);
    else setOutcome(result);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
    >
      <div className={styles.field}>
        <label htmlFor="password">{t('auth.common.password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          aria-describedby="password-hint"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <p id="password-hint" className={styles.hint}>
          {t('auth.sign_up.password_hint')}
        </p>
      </div>
      <OutcomeMessage outcome={outcome} t={t} />
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? t('auth.common.sending') : t('auth.new_password.submit')}
      </button>
    </form>
  );
}
