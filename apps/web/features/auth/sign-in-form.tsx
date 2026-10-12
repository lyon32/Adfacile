'use client';
// Connexion : Google, Apple, e-mail + mot de passe, lien magique (APPFLOW §4.2).
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { safeNext } from '../../server/auth/safe-next';
import { translator, type Locale } from './messages';
import { OAuthButtons } from './oauth-buttons';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';
import styles from './auth.module.css';

export interface SignInFormProps {
  locale: Locale;
  captchaSiteKey: string | undefined;
  /** Chemin de retour après connexion (`?retour=`). */
  next: string;
  initialOutcome: Outcome | null;
  idleNotice: boolean;
}

export function SignInForm(props: SignInFormProps): ReactNode {
  const t = translator(props.locale);
  const { mountCaptcha, captchaToken, resetCaptcha } = useTurnstile(props.captchaSiteKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(props.initialOutcome);
  const [magicSent, setMagicSent] = useState(false);
  const isReady = captchaToken !== null || props.captchaSiteKey === undefined;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    const result = await postAuth('/auth/sign-in', {
      email,
      password,
      captcha_token: captchaToken ?? '',
    });
    resetCaptcha();
    setPending(false);
    if (result === 'ok') {
      window.location.assign(safeNext(props.next));
      return;
    }
    setMagicSent(false);
    setOutcome(result);
  }

  async function handleMagicLink(): Promise<void> {
    setPending(true);
    const result = await postAuth('/auth/magic-link', {
      email,
      captcha_token: captchaToken ?? '',
    });
    resetCaptcha();
    setPending(false);
    setOutcome(result === 'ok' ? null : result);
    setMagicSent(result === 'ok');
  }

  return (
    <>
      {props.idleNotice && (
        <p role="status" className={styles.alert}>
          {t('auth.sign_in.idle_notice')}
        </p>
      )}
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </div>
        <div ref={mountCaptcha} className={styles.captcha} />
        <OutcomeMessage outcome={outcome} t={t} />
        {magicSent && <p role="status">{t('auth.sign_in.magic_link_sent')}</p>}
        <button type="submit" className={styles.primary} disabled={pending || !isReady}>
          {pending ? t('auth.common.sending') : t('auth.sign_in.submit')}
        </button>
        {!isReady && <p className={styles.hint}>{t('auth.common.captcha_wait')}</p>}
        <button
          type="button"
          className={styles.secondary}
          disabled={pending || !isReady || email === ''}
          onClick={() => {
            void handleMagicLink();
          }}
        >
          {t('auth.sign_in.magic_link')}
        </button>
      </form>
      <div className={styles.links}>
        <a className={styles.link} href="/mot-de-passe-oublie">
          {t('auth.sign_in.forgot')}
        </a>
        <span>
          {t('auth.sign_in.no_account')}{' '}
          <a className={styles.link} href="/inscription">
            {t('auth.sign_in.to_sign_up')}
          </a>
        </span>
      </div>
    </>
  );
}
