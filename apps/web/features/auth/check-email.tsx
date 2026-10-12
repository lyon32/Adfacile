'use client';
// « Vérifie ta boîte mail » (APPFLOW §4.1) : [Renvoyer le lien] actif après 60 s.
import { useEffect, useState, type ReactNode } from 'react';
import { translator, type Locale } from './messages';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';
import styles from './auth.module.css';

export const RESEND_DELAY_S = 60;

export function CheckEmail(props: {
  email: string;
  locale: Locale;
  captchaSiteKey: string | undefined;
}): ReactNode {
  const t = translator(props.locale);
  const { mountCaptcha, captchaToken, resetCaptcha } = useTurnstile(props.captchaSiteKey);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY_S);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Minuterie du bouton : synchronisation avec l'horloge (système extérieur).
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [secondsLeft]);

  async function handleResend(): Promise<void> {
    setPending(true);
    const result = await postAuth('/auth/resend', {
      email: props.email,
      captcha_token: captchaToken ?? '',
    });
    resetCaptcha();
    setPending(false);
    setOutcome(result);
    setSecondsLeft(RESEND_DELAY_S);
  }

  const isReady = captchaToken !== null || props.captchaSiteKey === undefined;
  return (
    <section aria-labelledby="check-email-title" className={styles.form}>
      <h2 id="check-email-title">{t('auth.check_email.title')}</h2>
      <p>{t('auth.check_email.body', { email: props.email })}</p>
      <div ref={mountCaptcha} className={styles.captcha} />
      {outcome === 'ok' ? (
        <p role="status">{t('auth.check_email.resent')}</p>
      ) : (
        <OutcomeMessage outcome={outcome} t={t} />
      )}
      <button
        type="button"
        className={styles.secondary}
        disabled={secondsLeft > 0 || pending || !isReady}
        onClick={() => {
          void handleResend();
        }}
      >
        {secondsLeft > 0
          ? t('auth.check_email.resend_in', { seconds: secondsLeft })
          : t('auth.check_email.resend')}
      </button>
    </section>
  );
}
