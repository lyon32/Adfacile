'use client';
// Mot de passe oublié (APPFLOW §4.3) : même message, compte connu ou non (EC-AUTH-05).
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { translator, type Locale } from './messages';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';
import styles from './auth.module.css';

export function ForgotPasswordForm(props: {
  locale: Locale;
  captchaSiteKey: string | undefined;
}): ReactNode {
  const t = translator(props.locale);
  const { mountCaptcha, captchaToken, resetCaptcha } = useTurnstile(props.captchaSiteKey);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const isReady = captchaToken !== null || props.captchaSiteKey === undefined;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    const result = await postAuth('/auth/forgot-password', {
      email,
      captcha_token: captchaToken ?? '',
    });
    resetCaptcha();
    setPending(false);
    setOutcome(result);
  }

  return (
    <>
      <p>{t('auth.forgot.body')}</p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div className={styles.field}>
          <label htmlFor="email">{t('auth.common.email')}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </div>
        <div ref={mountCaptcha} className={styles.captcha} />
        {outcome === 'ok' ? (
          <p role="status" className={styles.alert}>
            {t('auth.forgot.sent')}
          </p>
        ) : (
          <OutcomeMessage outcome={outcome} t={t} />
        )}
        <button type="submit" className={styles.primary} disabled={pending || !isReady}>
          {pending ? t('auth.common.sending') : t('auth.forgot.submit')}
        </button>
      </form>
      <div className={styles.links}>
        <a className={styles.link} href="/connexion">
          {t('auth.forgot.back')}
        </a>
      </div>
    </>
  );
}
