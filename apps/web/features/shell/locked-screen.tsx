'use client';
// Écran VERROUILLÉ (décision de la personne du 26/10/2026) : essai terminé sans abonnement, ou grâce de 3 jours écoulée. L'API refuse
// tout (`403 workspace_locked`), lecture des statistiques comprise ; il ne reste qu'un écran qui propose de s'abonner ou de renouveler.
// Un seul message, une seule action, la cause exacte vient du serveur (`status_cause`). La page `/abonnement` (S24, S25) n'existe pas
// encore : le bouton est affiché mais grisé, avec l'infobulle « Bientôt disponible ». Les campagnes déjà lancées continuent chez Meta
// jusqu'à la pause automatique de S19b (EC-PAY-11) ; la reprise est manuelle (« Reprendre mes pubs »). Les textes ne promettent rien de plus. Couleurs : jetons existants.
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useSession } from './session-context';
import { SoonButton } from './soon-button';

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
        <SoonButton soonLabel={t('soon')}>{t(`${cause}_cta`)}</SoonButton>
      ) : (
        <p className="font-semibold">{t('ask_owner')}</p>
      )}
    </section>
  );
}

/** Court texte au-dessus des pages restées joignables en verrouillé (abonnement, support, profil) : pourquoi l'accès est restreint. */
export function LockedNotice(): ReactNode {
  const t = useTranslations('shell.locked');
  return (
    <p role="status" className="text-meta text-muted mb-6 max-w-[65ch] font-semibold">
      {t('restricted_note')}
    </p>
  );
}
