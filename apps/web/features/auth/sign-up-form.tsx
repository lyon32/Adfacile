'use client';
// Inscription (APPFLOW §4.1) : Google, Apple, ou e-mail + mot de passe avec conditions
// obligatoires ; puis « Vérifie ta boîte mail » avec [Renvoyer le lien] actif après 60 s.
import { Button, Field } from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { PASSWORD_MIN_LENGTH } from '../../server/auth/schemas';
import { CheckEmail } from './check-email';
import { OAuthButtons } from './oauth-buttons';
import { LINK_CLASS, OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';

export interface SignUpFormProps {
  captchaSiteKey: string | undefined;
}

export function SignUpForm(props: SignUpFormProps): ReactNode {
  const t = useTranslations('auth');
  const locale = useLocale();
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
      locale,
    });
    resetCaptcha();
    setPending(false);
    if (result === 'ok') setSentTo(email);
    else setOutcome(result);
  }

  if (sentTo !== null) {
    return <CheckEmail email={sentTo} captchaSiteKey={props.captchaSiteKey} />;
  }

  return (
    <>
      <OAuthButtons />
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
        <Field
          label={t('common.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint={isTooShort ? undefined : t('sign_up.password_hint')}
          error={isTooShort ? t('errors.password_too_short') : undefined}
        />
        <label className="flex min-h-11 items-start gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={accepted}
            className="accent-ink mt-0.5 size-5 shrink-0"
            onChange={(e) => {
              setAccepted(e.target.checked);
            }}
          />
          <span>{t('sign_up.terms')}</span>
        </label>
        {!accepted && <p className="text-meta text-muted -mt-3">{t('sign_up.terms_required')}</p>}
        <div ref={mountCaptcha} className="empty:hidden" />
        <OutcomeMessage outcome={outcome} />
        <Button type="submit" disabled={pending || !accepted || !isReady}>
          {pending ? t('common.sending') : t('sign_up.submit')}
        </Button>
        {!isReady && <p className="text-meta text-muted">{t('common.captcha_wait')}</p>}
      </form>
      <p className="text-muted text-[15px]">
        {t('sign_up.has_account')}{' '}
        <a className={LINK_CLASS} href="/connexion">
          {t('sign_up.to_sign_in')}
        </a>
      </p>
    </>
  );
}
