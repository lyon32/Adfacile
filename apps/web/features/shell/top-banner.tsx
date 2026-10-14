// Bandeau du haut (APPFLOW §2.1, PRD §10.1) : trois informations au plus quand le compte a de
// l'activité ; sans activité, un appel à l'action. Les chiffres arrivent avec S17 : jusque-là,
// aucun compte n'a d'activité, donc l'appel à l'action s'affiche.
import { Button } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function TopBanner(): ReactNode {
  const t = useTranslations('shell.banner');
  return (
    <section
      aria-labelledby="top-banner-title"
      className="border-line bg-panel mb-6 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div>
        <h2 id="top-banner-title" className="text-title font-bold">
          {t('empty_title')}
        </h2>
        <p className="text-meta text-muted mt-1">{t('empty_body')}</p>
      </div>
      <Button asChild className="w-full sm:w-auto">
        <Link href="/campagnes/nouvelle">{t('empty_cta')}</Link>
      </Button>
    </section>
  );
}
