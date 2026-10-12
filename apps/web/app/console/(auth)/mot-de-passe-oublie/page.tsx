// Mot de passe oublié (APPFLOW §4.3), sans habillage final (S09).
import type { ReactNode } from 'react';
import { getEnv } from '@pubeka/shared';
import { AuthShell } from '../../../../features/auth/auth-shell';
import { ForgotPasswordForm } from '../../../../features/auth/forgot-password-form';
import { translator } from '../../../../features/auth/messages';
import { requestLocale } from '../../../../features/auth/request-locale';

export default async function ForgotPasswordPage(): Promise<ReactNode> {
  const locale = await requestLocale();
  const t = translator(locale);
  return (
    <AuthShell title={t('auth.forgot.title')}>
      <ForgotPasswordForm locale={locale} captchaSiteKey={getEnv().NEXT_PUBLIC_CAPTCHA_SITE_KEY} />
    </AuthShell>
  );
}
