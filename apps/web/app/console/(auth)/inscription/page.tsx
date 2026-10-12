// Inscription (APPFLOW §4.1), sans habillage final (S09).
import type { ReactNode } from 'react';
import { getEnv } from '@pubeka/shared';
import { AuthShell } from '../../../../features/auth/auth-shell';
import { translator } from '../../../../features/auth/messages';
import { requestLocale } from '../../../../features/auth/request-locale';
import { SignUpForm } from '../../../../features/auth/sign-up-form';

export default async function SignUpPage(): Promise<ReactNode> {
  const locale = await requestLocale();
  const t = translator(locale);
  return (
    <AuthShell title={t('auth.sign_up.title')}>
      <SignUpForm locale={locale} captchaSiteKey={getEnv().NEXT_PUBLIC_CAPTCHA_SITE_KEY} />
    </AuthShell>
  );
}
