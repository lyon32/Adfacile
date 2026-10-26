'use client';
// Bandeau d'état de l'espace (APPFLOW §19, SECURITY_NOTES §2.1) : grâce (3 jours), lecture seule (abonnement terminé ou
// essai terminé), suspension. Rien ne s'affiche quand l'espace est actif. L'état vient du serveur (`workspace.status`,
// calculé à chaque requête avec l'échéance de l'abonnement) : le bandeau n'invente aucune règle. Couleurs : jetons existants.
import { Button } from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from './session-context';

const DAY_MS = 24 * 3600 * 1000;

type Notice = 'grace' | 'trial_ended' | 'read_only' | 'suspended';

function daysLeft(until: string | null | undefined, now: string | undefined): number {
  if (until === null || until === undefined || now === undefined) return 1;
  const diff = new Date(until).getTime() - new Date(now).getTime();
  return Number.isNaN(diff) ? 1 : Math.max(1, Math.ceil(diff / DAY_MS));
}

export function AccessBanner(): ReactNode {
  const t = useTranslations('shell.access');
  const locale = useLocale();
  const session = useSession();
  const workspace = session.workspace;
  if (workspace === null || workspace.status === 'active') return null;

  const notice: Notice =
    workspace.status === 'read_only' && workspace.plan === 'trial'
      ? 'trial_ended'
      : workspace.status;
  const href = notice === 'suspended' ? '/support' : '/abonnement';
  const isOwner = workspace.role === 'owner';
  // Seul le propriétaire paie et écrit à l'administration de l'espace : les autres lisent le message sans bouton.
  const showAction = notice === 'suspended' || isOwner;

  const date =
    workspace.graceUntil === null || workspace.graceUntil === undefined
      ? ''
      : new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          timeZone: session.timezone ?? 'UTC',
        }).format(new Date(workspace.graceUntil));

  return (
    <section
      aria-label={t('label')}
      className="border-line bg-panel mb-6 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
    >
      <div className="max-w-[65ch]">
        <h2
          className={
            notice === 'grace'
              ? 'text-warn text-title font-bold'
              : 'text-error text-title font-bold'
          }
        >
          {notice === 'grace' ? t('grace_title', { date }) : t(`${notice}_title`)}
        </h2>
        <p className="text-meta text-muted mt-1">
          {notice === 'grace'
            ? t('grace_body', { days: daysLeft(workspace.graceUntil, session.serverNow) })
            : t(`${notice}_body`)}
        </p>
      </div>
      {showAction ? (
        <Button
          asChild
          variant={notice === 'grace' ? 'primary' : 'secondary'}
          className="w-full sm:w-auto"
        >
          <Link href={href}>{t(`${notice}_cta`)}</Link>
        </Button>
      ) : null}
    </section>
  );
}
