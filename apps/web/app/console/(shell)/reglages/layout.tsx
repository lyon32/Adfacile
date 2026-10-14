// Réglages : sous-menu à côté du contenu (APPFLOW §14).
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SettingsNav } from '../../../../features/settings/settings-nav';

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const t = await getTranslations('settings');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <div className="flex flex-col gap-6 min-[980px]:flex-row min-[980px]:gap-10">
        <SettingsNav />
        <div className="max-w-2xl min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
