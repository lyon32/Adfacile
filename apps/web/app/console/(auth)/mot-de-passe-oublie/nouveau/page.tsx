// Nouveau mot de passe après le lien de réinitialisation (APPFLOW §4.3). proxy.ts exige la
// session ouverte par ce lien ; sinon retour à la connexion avec « lien expiré ».
import type { ReactNode } from 'react';
import { AuthShell } from '../../../../../features/auth/auth-shell';
import { translator } from '../../../../../features/auth/messages';
import { NewPasswordForm } from '../../../../../features/auth/new-password-form';
import { requestLocale } from '../../../../../features/auth/request-locale';

export default async function NewPasswordPage(): Promise<ReactNode> {
  const locale = await requestLocale();
  const t = translator(locale);
  return (
    <AuthShell title={t('auth.new_password.title')}>
      <NewPasswordForm locale={locale} />
    </AuthShell>
  );
}
