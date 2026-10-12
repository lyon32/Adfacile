// Connexion (APPFLOW §4.2), sans habillage final (S09).
import type { ReactNode } from 'react';
import { getEnv } from '@pubeka/shared';
import { AuthShell } from '../../../../features/auth/auth-shell';
import { translator } from '../../../../features/auth/messages';
import { requestLocale } from '../../../../features/auth/request-locale';
import { SignInForm } from '../../../../features/auth/sign-in-form';
import { safeNext } from '../../../../server/auth/safe-next';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const [params, locale] = await Promise.all([searchParams, requestLocale()]);
  const t = translator(locale);
  const single = (v: string | string[] | undefined): string | undefined =>
    typeof v === 'string' ? v : undefined;
  const error = single(params.erreur);
  return (
    <AuthShell title={t('auth.sign_in.title')}>
      <SignInForm
        locale={locale}
        captchaSiteKey={getEnv().NEXT_PUBLIC_CAPTCHA_SITE_KEY}
        next={safeNext(single(params.retour))}
        initialOutcome={
          error === 'lien_expire' ? 'link_expired' : error === undefined ? null : 'unavailable'
        }
        idleNotice={single(params.raison) === 'inactivite'}
      />
    </AuthShell>
  );
}
