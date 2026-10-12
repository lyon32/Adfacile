'use client';
// Inscription (APPFLOW §4.1) : Google, Apple, ou e-mail + mot de passe avec conditions
// obligatoires ; puis « Vérifie ta boîte mail » avec [Renvoyer le lien] actif après 60 s.
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { PASSWORD_MIN_LENGTH } from '../../server/auth/schemas';
import { CheckEmail } from './check-email';
import { translator, type Locale } from './messages';
import { OAuthButtons } from './oauth-buttons';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';
import styles from './auth.module.css';

export interface SignUpFormProps {
  locale: Locale;
  captchaSiteKey: string | undefined;
}

export function SignUpForm(props: SignUpFormProps): ReactNode {
  const t = translator(props.locale);
  const { mountCaptcha, captchaToken, resetCaptcha } = useTurnstile(props.captchaSiteKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const isReady = captchaToken !== null || props.captchaSiteKey === undefined;
  const isTooShort = password !== '' && password.length < PASSWORD_MIN_LENGTH;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    const result = await postAuth('/auth/sign-up', {
      email,
      password,
      captcha_token: captchaToken ?? '',
      accept_terms: accepted,
      locale: props.locale,
    });
    resetCaptcha();
    setPending(false);
    if (result === 'ok') setSentTo(email);
    else setOutcome(result);
  }

  if (sentTo !== null) {
    return (
      <CheckEmail email={sentTo} locale={props.locale} captchaSiteKey={props.captchaSiteKey} />
    );
  }

  return (
    <>
      <OAuthButtons t={t} />
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
            aria-invalid={isTooShort}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          <p id="password-hint" className={styles.hint}>
            {isTooShort ? t('auth.errors.password_too_short') : t('auth.sign_up.password_hint')}
          </p>
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
            }}
          />
          <span>{t('auth.sign_up.terms')}</span>
        </label>
        {!accepted && <p className={styles.hint}>{t('auth.sign_up.terms_required')}</p>}
        <div ref={mountCaptcha} className={styles.captcha} />
        <OutcomeMessage outcome={outcome} t={t} />
        <button
          type="submit"
          className={styles.primary}
          disabled={pending || !accepted || !isReady}
        >
          {pending ? t('auth.common.sending') : t('auth.sign_up.submit')}
        </button>
        {!isReady && <p className={styles.hint}>{t('auth.common.captcha_wait')}</p>}
      </form>
      <div className={styles.links}>
        <span>
          {t('auth.sign_up.has_account')}{' '}
          <a className={styles.link} href="/connexion">
            {t('auth.sign_up.to_sign_in')}
          </a>
        </span>
      </div>
    </>
  );
}
