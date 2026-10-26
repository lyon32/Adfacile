'use client';
// Bandeau « Reprendre mes pubs » (S19b, TR-PAY-07, EC-PAY-11) : espace de nouveau ACTIF après un renouvellement, avec des publicités que le
// verrouillage a mises en pause. La reprise est MANUELLE et ne concerne que ces publicités (jamais celles que la personne avait mises en
// pause elle-même). Reprendre active les publicités chez Meta et dépense : une fenêtre de confirmation le dit avant. Propriétaire et
// éditeur seulement. Couleurs : jetons existants.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { useBillingPaused, useResumeAll } from './lock-api';
import { useSession } from './session-context';

function dollars(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function ResumeBanner(): ReactNode {
  const t = useTranslations('shell.resume');
  const common = useTranslations('common');
  const locale = useLocale();
  const session = useSession();
  const workspace = session.workspace;
  const [confirming, setConfirming] = useState(false);
  const eligible = workspace?.status === 'active' && workspace.role !== 'viewer';
  const workspaceId = workspace?.id ?? '';
  const paused = useBillingPaused(workspaceId, eligible);
  const resume = useResumeAll(workspaceId);
  if (!eligible) return null;

  const count = paused.data?.count ?? 0;
  const done = resume.data;
  // Le bilan d'une reprise reste affiché même quand plus aucune publicité n'est en attente.
  if (count === 0 && done === undefined && !resume.isError && !resume.isPending) return null;

  const disabled = resume.error instanceof ApiError && resume.error.status === 503;
  return (
    <section
      aria-label={t('label')}
      className="border-line bg-panel mb-6 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
    >
      <div className="max-w-[65ch]">
        {count > 0 ? (
          <>
            <h2 className="text-title font-bold">{t('title', { count })}</h2>
            <p className="text-meta text-muted mt-1">{t('body')}</p>
          </>
        ) : null}
        <div role="status" aria-live="polite" className="text-meta mt-1">
          {resume.isPending ? <p>{t('loading')}</p> : null}
          {done !== undefined && done.resumed > 0 ? (
            <p>{t('done', { count: done.resumed })}</p>
          ) : null}
          {done !== undefined && done.failed.length > 0 ? (
            <p className="text-error font-semibold">{t('failed', { count: done.failed.length })}</p>
          ) : null}
          {resume.isError ? (
            <p className="text-error font-semibold">{disabled ? t('disabled') : t('error')}</p>
          ) : null}
        </div>
      </div>
      {count > 0 ? (
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={resume.isPending}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t('cta')}
        </Button>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={common('close')}>
          <DialogTitle>{t('confirm_title')}</DialogTitle>
          <DialogDescription>
            {t('confirm_body', {
              count,
              budget: dollars(paused.data?.dailyBudgetUsdCents ?? 0, locale),
            })}
          </DialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="quiet">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setConfirming(false);
                resume.mutate();
              }}
            >
              {t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
