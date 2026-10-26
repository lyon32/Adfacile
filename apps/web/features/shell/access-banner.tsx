'use client';
// Bandeau d'état de l'espace (APPFLOW §19, SECURITY_NOTES §2.1, décision de la personne du 26/10/2026) : grâce de 3 jours (avec
// compte à rebours), lecture seule ou suspension décidées par l'administration. L'espace VERROUILLÉ n'a pas de bandeau : il a
// l'écran `LockedScreen`. Rien ne s'affiche quand l'espace est actif. L'état vient du serveur (`workspace.status`, calculé à chaque
// requête avec l'échéance de l'abonnement) : le bandeau n'invente aucune règle. Couleurs : jetons existants.
// Les pages `/abonnement` (S24, S25) et `/support` (S28) n'existent pas encore : les boutons sont affichés mais grisés, avec une
// infobulle « Bientôt disponible ».
// PROMESSE DU BANDEAU DE GRÂCE : « toutes tes publicités seront mises en pause » à la fin de la grâce. Elle est honorée par la session
// S19b (tâche planifiée) : ne pas déployer en production avant.
import { Button } from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useSession } from './session-context';

const DAY_MS = 24 * 3600 * 1000;

type Notice = 'grace' | 'admin_read_only' | 'suspended';

function daysLeft(until: string | null | undefined, now: string | undefined): number {
  if (until === null || until === undefined || now === undefined) return 1;
  const diff = new Date(until).getTime() - new Date(now).getTime();
  return Number.isNaN(diff) ? 1 : Math.max(1, Math.ceil(diff / DAY_MS));
}

/** Le message vient de l'état et de la CAUSE donnés par le serveur : jamais déduit de la formule. Verrouillé : pas de bandeau. */
export function noticeOf(status: string): Notice | null {
  if (status === 'suspended') return 'suspended';
  if (status === 'grace') return 'grace';
  if (status === 'read_only') return 'admin_read_only';
  return null;
}

/** Date d'échéance dans le fuseau de la personne ; un fuseau invalide ne casse pas l'écran (repli UTC). */
export function formatDeadline(iso: string, locale: string, timeZone: string | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timeZone ?? 'UTC' }).format(
      date,
    );
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
  }
}

export function AccessBanner(): ReactNode {
  const t = useTranslations('shell.access');
  const locale = useLocale();
  const session = useSession();
  const workspace = session.workspace;
  if (workspace === null) return null;
  const notice = noticeOf(workspace.status);
  if (notice === null) return null;

  const toSupport = notice !== 'grace';
  // Seul le propriétaire paie : les autres lisent le message sans bouton. Le support est ouvert à tous.
  const showAction = toSupport || workspace.role === 'owner';
  const date =
    workspace.graceUntil === null || workspace.graceUntil === undefined
      ? ''
      : formatDeadline(workspace.graceUntil, locale, session.timezone);

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
            ? t('grace_body', {
                date,
                days: daysLeft(workspace.graceUntil, session.serverNow),
              })
            : t(`${notice}_body`)}
        </p>
      </div>
      {showAction ? (
        <Button
          type="button"
          variant={notice === 'grace' ? 'primary' : 'secondary'}
          className="w-full sm:w-auto"
          disabled
          title={t('soon')}
        >
          {t(`${notice}_cta`)}
        </Button>
      ) : null}
    </section>
  );
}
