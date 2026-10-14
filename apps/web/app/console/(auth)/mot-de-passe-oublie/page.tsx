// Mot de passe oublié (APPFLOW §4.3).
import type { ReactNode } from 'react';
import { getEnv } from '@pubeka/shared';
import { AuthShell } from '../../../../features/auth/auth-shell';
import { ForgotPasswordForm } from '../../../../features/auth/forgot-password-form';
import { getTranslations } from 'next-intl/server';

export default async function ForgotPasswordPage(): Promise<ReactNode> {
  const t = await getTranslations();
  return (
    <AuthShell title={t('auth.forgot.title')}>
      <ForgotPasswordForm captchaSiteKey={getEnv().NEXT_PUBLIC_CAPTCHA_SITE_KEY} />
    </AuthShell>
  );
}
