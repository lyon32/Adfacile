'use client';
// Nouveau mot de passe, puis connexion automatique (APPFLOW §4.3, EC-AUTH-06).
import { Button, Field } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { PASSWORD_MIN_LENGTH } from '../../server/auth/schemas';
import { OutcomeMessage } from './outcome-message';
import { postAuth, type Outcome } from './post-auth';

export function NewPasswordForm(): ReactNode {
  const t = useTranslations('auth');
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
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
    >
      <Field
        label={t('common.password')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={t('sign_up.password_hint')}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <OutcomeMessage outcome={outcome} />
      <Button type="submit" disabled={pending}>
        {pending ? t('common.sending') : t('new_password.submit')}
      </Button>
    </form>
  );
}
