'use client';
// Mot de passe oublié (APPFLOW §4.3) : même message, compte connu ou non (EC-AUTH-05).
import { Button, Field } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { LINK_CLASS, OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';

export function ForgotPasswordForm(props: { captchaSiteKey: string | undefined }): ReactNode {
  const t = useTranslations('auth');
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
      <p className="text-muted">{t('forgot.body')}</p>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <Field
          label={t('common.email')}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <div ref={mountCaptcha} className="empty:hidden" />
        {outcome === 'ok' ? (
          <p
            role="status"
            className="border-line bg-bg rounded-md border px-3 py-2 text-sm font-semibold"
          >
            {t('forgot.sent')}
          </p>
        ) : (
          <OutcomeMessage outcome={outcome} />
        )}
        <Button type="submit" disabled={pending || !isReady}>
          {pending ? t('common.sending') : t('forgot.submit')}
        </Button>
      </form>
      <a className={`${LINK_CLASS} text-[15px]`} href="/connexion">
        {t('forgot.back')}
      </a>
    </>
  );
}
