// Tableau de bord `/` : salutation selon l'heure locale (TR-PLT-04), puis le tableau de bord de S17 (chiffres, graphique, campagnes).
// Sans espace de travail actif, la carte « Crée ta première pub » de S09 reste.
import { Button, Card, CardDescription } from '@pubeka/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Dashboard } from '../../../features/campaigns/dashboard';
import { loadViewer } from '../../../features/shell/viewer';
import { isWritableStatus } from '../../../features/shell/workspace-access';

export default async function DashboardPage(): Promise<ReactNode> {
  const [t, viewer] = await Promise.all([getTranslations('dashboard'), loadViewer()]);
  // Pays pas encore choisi : la première configuration n'est pas faite (APPFLOW §5).
  if (viewer?.me.country_code === null) redirect('/bienvenue/pays');
  const me = viewer?.me;
  const workspace = viewer?.workspace ?? null;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">
        {t(`greeting.${me?.greeting ?? 'bonjour'}`)}
        {me?.first_name ? `, ${me.first_name}` : ''}
      </h1>
      {workspace === null ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-title font-semibold">{t('home.first_campaign_title')}</h2>
          <CardDescription className="max-w-xl text-sm">
            {t('home.first_campaign_body')}
          </CardDescription>
          <Button asChild className="w-full sm:w-fit">
            <Link href="/campagnes/nouvelle">{t('home.first_campaign_cta')}</Link>
          </Button>
        </Card>
      ) : (
        <Dashboard
          workspaceId={workspace.id}
          canCreate={workspace.role !== 'viewer' && isWritableStatus(workspace.status)}
        />
      )}
    </div>
  );
}
