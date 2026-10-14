// Réglages `/reglages/{section}` : profil, équipe, notifications (les autres sections arrivent
// avec leur session : kit de marque et Pages S11, abonnement S24, mes données S34).
import { getNotificationPreferences, type Ctx } from '@pubeka/core';
import { createRequestId } from '@pubeka/shared';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { NotificationsForm } from '../../../../../features/settings/notifications-form';
import { ProfileForm } from '../../../../../features/settings/profile-form';
import { parseSection } from '../../../../../features/settings/sections';
import { TeamPanel } from '../../../../../features/settings/team-panel';
import { loadCountries } from '../../../../../features/shell/countries';
import { loadViewer } from '../../../../../features/shell/viewer';
import {
  createAuthServiceClient,
  createRequestAuthClient,
} from '../../../../../server/auth/supabase';

function Heading({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <header className="mb-6">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-muted mt-1">{body}</p>
    </header>
  );
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<ReactNode> {
  const section = parseSection((await params).section);
  const viewer = await loadViewer();
  if (section === null || viewer === null) notFound();
  const { me, workspace } = viewer;

  if (section === 'profil') {
    const [t, countries] = await Promise.all([
      getTranslations('settings.profile'),
      loadCountries(me.ui_language),
    ]);
    return (
      <>
        <Heading title={t('title')} body={t('body')} />
        <ProfileForm
          email={me.email}
          countries={countries}
          initial={{
            first_name: me.first_name ?? '',
            last_name: me.last_name ?? '',
            phone: me.phone ?? '',
            country_code: me.country_code ?? 'CM',
            city: me.city ?? '',
            currency_display: me.currency_display,
            ui_language: me.ui_language,
            theme: me.theme,
          }}
        />
      </>
    );
  }

  if (section === 'equipe') {
    const t = await getTranslations('settings.team');
    if (workspace === null) notFound();
    return (
      <>
        <Heading title={t('title')} body={t('body')} />
        <TeamPanel
          workspaceId={workspace.id}
          isOwner={workspace.role === 'owner'}
          membersLimit={workspace.quotas.members_limit}
        />
      </>
    );
  }

  const ctx: Ctx = {
    requestId: createRequestId(),
    user: { id: me.id, email: me.email, locale: me.ui_language, timezone: me.timezone },
    db: await createRequestAuthClient(),
    svc: createAuthServiceClient(),
    now: () => new Date(),
  };
  const [t, preferences] = await Promise.all([
    getTranslations('settings.notifications'),
    getNotificationPreferences(ctx),
  ]);
  return (
    <>
      <Heading title={t('title')} body={t('body')} />
      <NotificationsForm initial={preferences} />
    </>
  );
}
