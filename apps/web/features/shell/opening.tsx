'use client';
// Animation d'ouverture : une seule fois par session (APPFLOW §2.3, TR-PRF-04), puis fondu.
import { OpeningLoader } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function Opening(): ReactNode {
  const t = useTranslations('shell');
  return <OpeningLoader label={t('opening')} />;
}
