'use client';
// Bouton « Mettre toutes mes publicités en pause » de l'écran VERROUILLÉ (S19b, TR-PAY-07, EC-PAY-11). Propriétaire et éditeur
// seulement. Le résultat vient du serveur (Meta d'abord, relu) : l'écran ne dit « en pause » que pour ce que Meta a confirmé.
// Jamais de reprise ici : la reprise est le bouton « Reprendre mes pubs » après le renouvellement. Couleurs : jetons existants.
import { Button } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { usePauseAll, type PauseAllResult } from './lock-api';

type Reason = 'meta_connection' | 'rate_limited' | 'conflict' | 'other';

function reasonOf(code: string): Reason {
  if (code === 'meta_token_expired' || code === 'meta_not_connected') return 'meta_connection';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'conflict') return 'conflict';
  return 'other';
}

function Outcome({ result }: { result: PauseAllResult }): ReactNode {
  const t = useTranslations('shell.locked');
  const reasons = [...new Set(result.failed.map((f) => reasonOf(f.code)))];
  if (result.failed.length === 0) {
    return (
      <p>
        {result.paused === 0 ? t('pause_all_none') : t('pause_all_done', { count: result.paused })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {result.paused > 0 ? <p>{t('pause_all_done', { count: result.paused })}</p> : null}
      <p className="text-error font-semibold">
        {t('pause_all_failed', { count: result.failed.length })}
      </p>
      <ul className="text-muted list-disc pl-5">
        {reasons.map((reason) => (
          <li key={reason}>{t(`pause_reason_${reason}`)}</li>
        ))}
      </ul>
    </div>
  );
}

export function PauseAllPanel({ workspaceId }: { workspaceId: string }): ReactNode {
  const t = useTranslations('shell.locked');
  const pause = usePauseAll(workspaceId);
  return (
    <div className="border-line mt-2 flex max-w-[65ch] flex-col items-start gap-3 border-t pt-5">
      <p className="text-meta text-muted">{t('pause_all_hint')}</p>
      <Button
        type="button"
        variant="quiet"
        className="w-full sm:w-auto"
        disabled={pause.isPending}
        aria-busy={pause.isPending}
        onClick={() => {
          pause.mutate();
        }}
      >
        {pause.isPending ? t('pause_all_loading') : t('pause_all')}
      </Button>
      <div role="status" aria-live="polite" className="text-meta">
        {pause.isError ? <p className="text-error font-semibold">{t('pause_all_error')}</p> : null}
        {pause.data === undefined ? null : <Outcome result={pause.data} />}
      </div>
    </div>
  );
}
