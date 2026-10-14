// Nouveau mot de passe après le lien de réinitialisation (APPFLOW §4.3). proxy.ts exige la
// session ouverte par ce lien ; sinon retour à la connexion avec « lien expiré ».
import type { ReactNode } from 'react';
import { AuthShell } from '../../../../../features/auth/auth-shell';
import { getTranslations } from 'next-intl/server';
import { NewPasswordForm } from '../../../../../features/auth/new-password-form';

export default async function NewPasswordPage(): Promise<ReactNode> {
  const t = await getTranslations();
  return (
    <AuthShell title={t('auth.new_password.title')}>
      <NewPasswordForm />
    </AuthShell>
  );
}
