'use client';
// Sous-menu des réglages (APPFLOW §14, « double navigation ») : colonne à gauche sur ordinateur,
// onglets en haut sur téléphone.
import { cn } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SETTINGS_SECTIONS } from './sections';

const LABEL = { profil: 'profile', equipe: 'team', notifications: 'notifications' } as const;

export function SettingsNav(): ReactNode {
  const t = useTranslations('settings');
  const pathname = usePathname();
  return (
    <nav aria-label={t('nav_label')}>
      <ul className="flex gap-1 min-[980px]:w-52 min-[980px]:flex-col">
        {SETTINGS_SECTIONS.map((section) => {
          const active = pathname === `/reglages/${section}`;
          return (
            <li key={section} className="min-[980px]:w-full">
              <Link
                href={`/reglages/${section}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center rounded-md border px-4 text-[15px] font-semibold transition-colors motion-reduce:transition-none',
                  active
                    ? 'border-line bg-panel text-ink'
                    : 'text-muted hover:text-ink border-transparent',
                )}
              >
                {t(`nav.${LABEL[section]}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
