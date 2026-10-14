'use client';
// « Vérifie ta boîte mail » (APPFLOW §4.1) : [Renvoyer le lien] actif après 60 s.
import { Button } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';

export const RESEND_DELAY_S = 60;

export function CheckEmail(props: {
  email: string;
  captchaSiteKey: string | undefined;
}): ReactNode {
  const t = useTranslations('auth.check_email');
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
    <section aria-labelledby="check-email-title" className="flex flex-col gap-4">
      <h2 id="check-email-title" className="text-title font-bold">
        {t('title')}
      </h2>
      <p>{t('body', { email: props.email })}</p>
      <div ref={mountCaptcha} className="empty:hidden" />
      {outcome === 'ok' ? (
        <p role="status" className="text-sm font-semibold">
          {t('resent')}
        </p>
      ) : (
        <OutcomeMessage outcome={outcome} />
      )}
      <Button
        type="button"
        variant="quiet"
        disabled={secondsLeft > 0 || pending || !isReady}
        onClick={() => {
          void handleResend();
        }}
      >
        {secondsLeft > 0 ? t('resend_in', { seconds: secondsLeft }) : t('resend')}
      </Button>
    </section>
  );
}
