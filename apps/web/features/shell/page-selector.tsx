'use client';
// Sélecteur de Page active (APPFLOW §2.1). Les Pages arrivent avec la connexion Meta (S11) :
// d'ici là, l'état vide propose de connecter une Page.
import { Eyebrow } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageSelector(): ReactNode {
  const t = useTranslations('shell.page_selector');
  return (
    <section
      aria-labelledby="page-selector-label"
      className="border-line bg-bg rounded-md border p-3"
    >
      <Eyebrow id="page-selector-label">{t('label')}</Eyebrow>
      <p className="text-title mt-2 font-semibold">{t('empty_title')}</p>
      <p className="text-meta text-muted mt-1">{t('empty_hint')}</p>
      <Link
        href="/bienvenue/meta"
        className="text-meta text-ink mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        {t('connect')}
      </Link>
    </section>
  );
}
