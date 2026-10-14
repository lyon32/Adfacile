// Coque de l'application : connexion obligatoire, espace actif, navigation (S09).
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { IdleLogout } from '../../../features/auth/idle-logout';
import { AppShell } from '../../../features/shell/app-shell';
import { Opening } from '../../../features/shell/opening';
import { SessionProvider } from '../../../features/shell/session-context';
import { TopBanner } from '../../../features/shell/top-banner';
import { loadViewer } from '../../../features/shell/viewer';

export default async function ShellLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const viewer = await loadViewer();
  if (viewer === null) redirect('/connexion');
  const { me, workspace } = viewer;
  return (
    <SessionProvider
      value={{
        userId: me.id,
        email: me.email,
        firstName: me.first_name,
        lastName: me.last_name,
        locale: me.ui_language,
        theme: me.theme,
        workspace:
          workspace === null
            ? null
            : {
                id: workspace.id,
                name: workspace.name,
                role: workspace.role,
                plan: workspace.plan,
                status: workspace.status,
              },
      }}
    >
      <Opening />
      <AppShell idle={<IdleLogout locale={me.ui_language} />} banner={<TopBanner />}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
