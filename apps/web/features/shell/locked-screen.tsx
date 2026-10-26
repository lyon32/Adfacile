'use client';
// Écran VERROUILLÉ (décision de la personne du 26/10/2026) : essai terminé sans abonnement, ou grâce de 3 jours écoulée. L'API refuse
// tout (`403 workspace_locked`), lecture des statistiques comprise ; il ne reste qu'un écran qui propose de s'abonner ou de renouveler.
// Un seul message, une seule action, la cause exacte vient du serveur (`status_cause`). La page `/abonnement` (S24, S25) n'existe pas
// encore : le bouton est affiché mais grisé, avec l'infobulle « Bientôt disponible ». Les campagnes déjà lancées continuent chez Meta
// (EC-PAY-11). Couleurs : jetons existants.
import { Button } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useSession } from './session-context';

export function LockedScreen(): ReactNode {
  const t = useTranslations('shell.locked');
  const session = useSession();
  const workspace = session.workspace;
  const cause = workspace?.statusCause === 'trial_ended' ? 'trial_ended' : 'subscription_ended';
  // Seul le propriétaire s'abonne ; les autres membres lisent le message.
  const showAction = workspace?.role === 'owner';

  return (
    <section
      aria-labelledby="locked-title"
      className="mx-auto flex min-h-[50dvh] w-full max-w-[560px] flex-col justify-center gap-4 py-8"
    >
      <h1 id="locked-title" className="text-2xl font-bold sm:text-3xl">
        {t(`${cause}_title`)}
      </h1>
      <p className="text-muted max-w-[65ch]">{t(`${cause}_body`)}</p>
      {showAction ? (
        <Button type="button" className="w-full self-start sm:w-auto" disabled title={t('soon')}>
          {t(`${cause}_cta`)}
        </Button>
      ) : null}
    </section>
  );
}
