'use client';
// Connexion : Google, Apple, e-mail + mot de passe, lien magique (APPFLOW §4.2).
import { Button, Field } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { safeNext } from '../../server/auth/safe-next';
import { OAuthButtons } from './oauth-buttons';
import { LINK_CLASS, OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';
import { useTurnstile } from './use-turnstile';

export interface SignInFormProps {
  captchaSiteKey: string | undefined;
  /** Chemin de retour après connexion (`?retour=`). */
  next: string;
  initialOutcome: Outcome | null;
  idleNotice: boolean;
}

export function SignInForm(props: SignInFormProps): ReactNode {
  const t = useTranslations('auth');
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
        <p
          role="status"
          className="border-line bg-bg rounded-md border px-3 py-2 text-sm font-semibold"
        >
          {t('sign_in.idle_notice')}
        </p>
      )}
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <div ref={mountCaptcha} className="empty:hidden" />
        <OutcomeMessage outcome={outcome} />
        {magicSent && (
          <p role="status" className="text-sm font-semibold">
            {t('sign_in.magic_link_sent')}
          </p>
        )}
        <Button type="submit" disabled={pending || !isReady}>
          {pending ? t('common.sending') : t('sign_in.submit')}
        </Button>
        {!isReady && <p className="text-meta text-muted">{t('common.captcha_wait')}</p>}
        <Button
          type="button"
          variant="quiet"
          disabled={pending || !isReady || email === ''}
          onClick={() => {
            void handleMagicLink();
          }}
        >
          {t('sign_in.magic_link')}
        </Button>
      </form>
      <div className="flex flex-col gap-1 text-[15px]">
        <a className={LINK_CLASS} href="/mot-de-passe-oublie">
          {t('sign_in.forgot')}
        </a>
        <span className="text-muted">
          {t('sign_in.no_account')}{' '}
          <a className={LINK_CLASS} href="/inscription">
            {t('sign_in.to_sign_up')}
          </a>
        </span>
      </div>
    </>
  );
}
