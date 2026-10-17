'use client';
// Étape « Publier » (APPFLOW §8.6) : vérification finale, fenêtre de responsabilité à la première publication, publication en
// cours (suivie sans recharger), succès, et chaque erreur du tableau d'APPFLOW §8.6. Le serveur est la seule vérité : le statut, la
// raison d'un échec et la clause viennent de lui. L'`Idempotency-Key` est créée à l'intention de publier et gardée tant que le
// résultat est incertain (coupure réseau) : un renvoi ne publie jamais deux fois.
import {
  Button,
  buttonVariants,
  Card,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pubeka/ui';
import { Check, CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { Guide } from '../meta-connection/health-list';
import { CostPanel } from './cost-panel';
import { useCampaign } from './proposal-api';
import { FailurePanel } from './publish-failure-panel';
import { failureFrom, failureFromRecord, type PublishFailure } from './publish-errors';
import { usePublish, usePublishedCampaign, useReadiness, type Readiness } from './publish-api';

export interface PublishStepProps {
  workspaceId: string;
  campaignId: string;
  onBackToPreview: () => void;
  onBackToProposal: () => void;
  onSources: () => void;
}

/** Au-delà de ce délai en « publication », l'écran passe à « on vérifie » : Meta tarde, Pubeka contrôle avant de conclure. */
const SLOW_AFTER_MS = 45_000;

type Check = 'ok' | 'ko' | 'unknown';

function checksOf(ready: Readiness): { page: Check; account: Check; payment: Check; photo: Check } {
  return {
    page: ready.page?.active === true ? 'ok' : 'ko',
    account: ready.meta.connection === 'ok' || ready.meta.connection === 'expiring' ? 'ok' : 'ko',
    payment:
      ready.meta.payment_method === 'present'
        ? 'ok'
        : ready.meta.payment_method === 'missing'
          ? 'ko'
          : 'unknown',
    photo: ready.visual.status === 'ready' ? 'ok' : 'ko',
  };
}

function CheckRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: Check;
  detail: string;
}): ReactNode {
  const t = useTranslations('campaign.wizard.publish.checks');
  return (
    <li className="border-line grid gap-1 border-t py-3 first:border-t-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <span className="tracking-eyebrow text-muted pt-0.5 text-xs font-bold uppercase">
        {label}
      </span>
      <span className="flex items-start gap-2">
        {state === 'ok' ? (
          <CircleCheck aria-hidden="true" className="text-success mt-0.5 size-5 shrink-0" />
        ) : (
          <CircleAlert
            aria-hidden="true"
            className={cn('mt-0.5 size-5 shrink-0', state === 'ko' ? 'text-error' : 'text-muted')}
          />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">
            {state === 'ok' ? t('ok') : state === 'ko' ? t('ko') : t('unknown')}
          </span>
          <span className="text-meta text-muted break-words">{detail}</span>
        </span>
      </span>
    </li>
  );
}

export function PublishStep(props: PublishStepProps): ReactNode {
  const { workspaceId, campaignId } = props;
  const t = useTranslations('campaign.wizard.publish');
  const checksT = useTranslations('campaign.wizard.publish.checks');
  const campaignQuery = usePublishedCampaign(workspaceId, campaignId);
  const fallback = useCampaign(workspaceId, campaignId);
  const readiness = useReadiness(workspaceId, campaignId);
  const publish = usePublish(workspaceId, campaignId);
  const [failure, setFailure] = useState<PublishFailure | null>(null);
  const [asking, setAsking] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [slowVersion, setSlowVersion] = useState<number | null>(null);
  const key = useRef<string | null>(null);

  const campaign = campaignQuery.data ?? fallback.data;
  const status = campaign?.status;

  // « On vérifie » : seulement si la publication dure vraiment. Minuterie d'interface (pas une donnée du serveur) ; la version de la
  // campagne change à chaque nouvelle publication, ce qui remet l'écran à zéro sans écrire d'état dans l'effet.
  const version = campaign?.version;
  useEffect(() => {
    if (status !== 'publishing' || version === undefined) return undefined;
    const timer = window.setTimeout(() => {
      setSlowVersion(version);
    }, SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status, version]);
  const slow = status === 'publishing' && slowVersion !== null && slowVersion === version;

  if (campaign === undefined || readiness.data === undefined) {
    return (
      <p role="status" className="text-muted">
        {t('progress.title')}
      </p>
    );
  }
  const ready = readiness.data;
  const checks = checksOf(ready);

  function submit(accept: boolean, confirmed?: { amount_minor: number; currency: string }): void {
    setFailure(null);
    key.current ??= crypto.randomUUID();
    const total =
      confirmed ??
      (campaign?.cost.status === 'ok' && campaign.cost.total
        ? { amount_minor: campaign.cost.total.local_minor, currency: campaign.cost.total.currency }
        : undefined);
    publish.mutate(
      {
        key: key.current,
        acceptLiability: accept,
        ...(total === undefined ? {} : { confirmedTotal: total }),
      },
      {
        onSuccess: () => {
          key.current = null;
        },
        onError: (error) => {
          // Réponse du serveur = intention close : la prochaine tentative est une nouvelle intention (nouvelle clé).
          // Pas de réponse (coupure) : on garde la clé, le renvoi retrouve la même publication.
          if (error instanceof ApiError) key.current = null;
          const next = failureFrom(error);
          // La clause n'avait pas été acceptée (autre onglet, autre membre) : on la demande, sans message d'erreur.
          if (next.kind === 'liability') setAsking(true);
          else setFailure(next);
        },
      },
    );
  }

  function onPublish(): void {
    if (ready.liability_required) setAsking(true);
    else submit(false);
  }

  // ---- Publication en cours ---------------------------------------------------------------------------------------------------
  if (status === 'publishing' || publish.isPending) {
    return (
      <Card role="status" aria-live="polite" className="flex flex-col gap-3">
        <h1 className="text-title text-xl font-bold">
          {slow ? t('progress.verifying_title') : t('progress.title')}
        </h1>
        <p className="text-muted">{slow ? t('progress.verifying_body') : t('progress.body')}</p>
      </Card>
    );
  }

  // ---- Succès : la campagne est chez Meta ------------------------------------------------------------------------------------
  if (
    status === 'in_review' ||
    status === 'active' ||
    status === 'paused' ||
    status === 'ended' ||
    status === 'stopped' ||
    status === 'rejected'
  ) {
    return (
      <section className="flex flex-col gap-5" aria-labelledby="published-title">
        <Card role="status" className="flex flex-col gap-3">
          <h1 id="published-title" className="text-title flex items-center gap-2 text-xl font-bold">
            <Check aria-hidden="true" className="size-6" />
            {t('success.title')}
          </h1>
          <p className="text-muted">{t('success.body')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/campagnes/${campaignId}`}
              className={cn(buttonVariants({ variant: 'primary' }), 'w-full sm:w-auto')}
            >
              {t('success.view')}
            </Link>
            <Link
              href="/campagnes/nouvelle"
              className={cn(buttonVariants({ variant: 'quiet' }), 'w-full sm:w-auto')}
            >
              {t('success.another')}
            </Link>
          </div>
        </Card>
        <Card>
          <CostPanel cost={campaign.cost} />
        </Card>
      </section>
    );
  }

  // ---- Brouillon (ou erreur) : vérification finale puis publication ----------------------------------------------------------
  const recorded = campaign.publication_error ?? null;
  const shown: PublishFailure | null =
    failure ?? (recorded === null ? null : failureFromRecord(recorded));
  const blocked =
    checks.page === 'ko' ||
    checks.account === 'ko' ||
    checks.payment === 'ko' ||
    checks.photo === 'ko';

  return (
    <section aria-labelledby="publish-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="publish-title" className="text-2xl font-bold">
          {t('title')}
        </h1>
        <p className="text-muted">{t('body')}</p>
      </header>

      {shown === null || shown.kind === 'liability' ? null : (
        <FailurePanel
          failure={shown}
          campaignId={campaignId}
          busy={publish.isPending}
          onGuide={() => {
            setGuideOpen(true);
          }}
          onRetry={() => {
            submit(false);
          }}
          onConfirmTotal={(total) => {
            key.current = null;
            submit(false, total);
          }}
          onBackToProposal={props.onBackToProposal}
          onSources={props.onSources}
        />
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="tracking-eyebrow text-muted text-xs font-bold uppercase">
          {t('checks_title')}
        </h2>
        <ul>
          <CheckRow
            label={checksT('page')}
            state={checks.page}
            detail={
              ready.page === null
                ? checksT('page_none')
                : ready.page.active
                  ? checksT('page_ok', { name: ready.page.name ?? '' })
                  : checksT('page_ko')
            }
          />
          <CheckRow
            label={checksT('account')}
            state={checks.account}
            detail={
              ready.meta.ad_account === null
                ? checksT('account_ko')
                : checks.account === 'ko'
                  ? checksT('account_expired')
                  : checksT('account_ok', {
                      name: ready.meta.ad_account.name ?? ready.meta.ad_account.currency ?? '',
                    })
            }
          />
          <CheckRow
            label={checksT('payment')}
            state={checks.payment}
            detail={
              checks.payment === 'ko'
                ? checksT('payment_ko')
                : checks.payment === 'ok'
                  ? checksT('payment_ok')
                  : ''
            }
          />
          <CheckRow
            label={checksT('photo')}
            state={checks.photo}
            detail={checks.photo === 'ok' ? checksT('photo_ok') : checksT('photo_ko')}
          />
        </ul>
        <p className="text-meta text-muted border-line border-t pt-3">{t('pay_note')}</p>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="self-start"
          onClick={() => {
            setGuideOpen(true);
          }}
        >
          {t('guide')}
        </Button>
      </Card>

      <Card>
        <CostPanel cost={campaign.cost} />
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="w-full sm:w-auto" disabled={blocked} onClick={onPublish}>
          {t('actions.publish')}
        </Button>
        <Button
          type="button"
          variant="quiet"
          className="w-full sm:w-auto"
          onClick={props.onBackToPreview}
        >
          {t('actions.back')}
        </Button>
      </div>

      {asking ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setAsking(false);
          }}
        >
          <DialogContent closeLabel={t('liability.cancel')} className="flex flex-col gap-4">
            <DialogTitle>{t('liability.title')}</DialogTitle>
            <DialogDescription>{t('liability.body')}</DialogDescription>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => {
                  setAsking(false);
                  submit(true);
                }}
              >
                {t('liability.confirm')}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="quiet" className="w-full sm:w-auto">
                  {t('liability.cancel')}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {guideOpen ? (
        <Guide
          slug="payment-method"
          onClose={(open) => {
            if (!open) setGuideOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
