'use client';
// Fenêtre « Tu es toujours là ? » et déconnexion après 10 minutes (TR-SEC-13). Les brouillons
// restent sur l'appareil ; une tâche serveur en cours n'est pas interrompue (EC-AUTH-03).
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { clearQueryCache } from '../../lib/query-client';
import { idleSignInPath } from './idle';
import { useIdleLogout } from './use-idle-logout';
import { postAuth } from './post-auth';

export function IdleLogout(): ReactNode {
  const t = useTranslations('auth.idle');
  const common = useTranslations('common');
  const { phase, stayConnected } = useIdleLogout({
    onExpire: () => {
      const target = idleSignInPath(window.location.pathname + window.location.search);
      clearQueryCache();
      void postAuth('/auth/sign-out', {}).finally(() => {
        window.location.assign(target);
      });
    },
  });
  return (
    <Dialog open={phase.kind === 'warning'}>
      <DialogContent
        role="alertdialog"
        closeLabel={common('close')}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription aria-live="polite">
          {phase.kind === 'warning' ? t('body', { seconds: phase.secondsLeft }) : null}
        </DialogDescription>
        <Button className="mt-5 w-full" onClick={stayConnected} autoFocus>
          {t('stay')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
