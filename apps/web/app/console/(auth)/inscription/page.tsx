// Inscription (APPFLOW §4.1).
import type { ReactNode } from 'react';
import { getEnv } from '@pubeka/shared';
import { AuthShell } from '../../../../features/auth/auth-shell';
import { getTranslations } from 'next-intl/server';
import { SignUpForm } from '../../../../features/auth/sign-up-form';

export default async function SignUpPage(): Promise<ReactNode> {
  const t = await getTranslations();
  return (
    <AuthShell title={t('auth.sign_up.title')}>
      <SignUpForm captchaSiteKey={getEnv().NEXT_PUBLIC_CAPTCHA_SITE_KEY} />
    </AuthShell>
  );
}
