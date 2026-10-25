'use client';
// Écran « Voir pourquoi » (APPFLOW §12) : ce qui s'est passé, l'élément en cause surligné dans la pub, la correction proposée (avant /
// après), puis les actions. La correction ne concerne que les textes (texte principal, titre, description) : le visuel et la page de
// destination se corrigent à la main. Un produit interdit par Meta n'a aucune action de republication. Un refus PARTIEL d'un test A/B
// (EC-META-06) dit que la campagne continue avec l'autre pub.
//
// Rien n'est inventé à l'écran : le rapport, la cause et la correction viennent du serveur (Modérateur, validé par le code) ; le
// motif de Meta est montré tel quel. Les couleurs sont celles des jetons du design system, jamais une valeur écrite ici.
import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Eyebrow,
} from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { STATUSES, useCampaignDetail, useControlCampaign, type CampaignStatus } from './api';
import {
  asCopyField,
  fixFailureOf,
  useApplyFix,
  useRejection,
  type CopyField,
  type Rejection,
} from './rejection-api';
import { splitAtExcerpt } from './rejection-text';
import { StatusPill } from './status';

export interface RejectionPageProps {
  workspace: { id: string; role: 'owner' | 'editor' | 'viewer'; status: string };
  campaignId: string;
  rejectionId: string;
}

/** Aide officielle de Meta sur les pubs refusées (la démarche du nouvel examen en vient). */
const META_HELP_URL = 'https://www.facebook.com/business/help/1210227555661027';

function asStatus(value: string): CampaignStatus {
  return STATUSES.find((status) => status === value) ?? 'error';
}

export function RejectionPage({
  workspace,
  campaignId,
  rejectionId,
}: RejectionPageProps): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const rejection = useRejection(workspace.id, campaignId, rejectionId);
  const campaign = useCampaignDetail(workspace.id, campaignId);

  if (rejection.isError && rejection.data === undefined) {
    const notFound = rejection.error instanceof ApiError && rejection.error.status === 404;
    return (
      <Card role="alert" className="flex flex-col gap-3">
        <p className="text-error font-semibold">{notFound ? t('not_found') : t('load_failed')}</p>
        <Button asChild variant="quiet" className="self-start">
          <Link href={`/campagnes/${campaignId}`}>{t('back')}</Link>
        </Button>
      </Card>
    );
  }
  if (rejection.data === undefined || campaign.data === undefined) {
    return (
      <p role="status" className="text-meta text-muted">
        {t('loading')}
      </p>
    );
  }
  return (
    <RejectionContent
      workspace={workspace}
      campaignId={campaignId}
      rejection={rejection.data}
      campaignName={campaign.data.name}
      campaignStatus={asStatus(campaign.data.status)}
      copy={{
        primary_text: campaign.data.copy.primary_text ?? '',
        headline: campaign.data.copy.headline ?? '',
        description: campaign.data.copy.description ?? '',
      }}
      campaignVersion={campaign.data.version}
      analysisId={campaign.data.analysis_id ?? null}
    />
  );
}

function RejectionContent({
  workspace,
  campaignId,
  rejection,
  campaignName,
  campaignStatus,
  copy,
  campaignVersion,
  analysisId,
}: {
  workspace: RejectionPageProps['workspace'];
  campaignId: string;
  rejection: Rejection;
  campaignName: string;
  campaignStatus: CampaignStatus;
  copy: Record<CopyField, string>;
  campaignVersion: number;
  analysisId: string | null;
}): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const common = useTranslations('common');
  const router = useRouter();
  const apply = useApplyFix(workspace.id, campaignId, rejection.id);
  const control = useControlCampaign(workspace.id, campaignId);
  const [confirming, setConfirming] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  // `Idempotency-Key` de CETTE intention : gardée pour un renvoi après coupure, renouvelée après une réponse du serveur.
  const key = useRef<string | null>(null);

  const canAct = workspace.role === 'owner' || workspace.role === 'editor';
  const writable = workspace.status === 'active';
  const report = rejection.report;
  const variant = rejection.variant;
  const waiting = rejection.status === 'pending' || rejection.status === 'running';
  const failed = rejection.status === 'failed' || (rejection.status === 'ready' && report === null);
  const fix = report?.fix ?? null;
  const fixField = fix === null ? null : asCopyField(fix.field);
  const sent = rejection.fixed;

  const editMyself = (): void => {
    control.mutate(
      { action: 'copy', version: campaignVersion },
      {
        onSuccess: (next) => {
          // Comme « Dupliquer » : la copie repart de l'aperçu de l'assistant (APPFLOW §11.4).
          const origin = next.analysis_id ?? analysisId;
          router.push(
            origin === null
              ? '/campagnes/nouvelle'
              : `/campagnes/nouvelle?analyse=${origin}&campagne=${next.id}&etape=apercu`,
          );
        },
      },
    );
  };

  const publish = (): void => {
    setConfirming(false);
    key.current ??= crypto.randomUUID();
    apply.mutate(
      { key: key.current },
      {
        onSuccess: () => {
          key.current = null;
        },
        onError: (error) => {
          if (error instanceof ApiError) key.current = null;
        },
      },
    );
  };

  const failure = apply.isError ? fixFailureOf(apply.error) : null;
  const title = variant === null ? t('title') : t('title_partial', { variant });
  const canApply =
    rejection.fix_applicable && canAct && writable && !sent && !apply.isSuccess && !waiting;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/campagnes/${campaignId}`}
          className="text-meta text-muted w-fit underline underline-offset-2"
        >
          {t('back')}
        </Link>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-bold break-words sm:text-3xl">{title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={campaignStatus} />
            <span className="text-meta text-muted break-words">{campaignName}</span>
          </div>
        </div>
        {rejection.partial ? (
          <Card role="status" className="border-warn flex flex-col gap-1">
            <p className="font-semibold">{t('partial_notice', { variant: variant ?? '' })}</p>
            <p className="text-meta text-muted">
              {t('partial_no_apply', { variant: variant ?? '' })}
            </p>
          </Card>
        ) : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <Eyebrow>{t('section_what')}</Eyebrow>
            {waiting ? (
              <div role="status" className="flex flex-col gap-1">
                <p className="font-semibold">{t('pending_title')}</p>
                <p className="text-meta text-muted">{t('pending_body')}</p>
              </div>
            ) : failed ? (
              <div className="flex flex-col gap-1">
                <p className="font-semibold">{t('failed_title')}</p>
                <p className="text-meta text-muted">{t('failed_body')}</p>
              </div>
            ) : report === null ? null : (
              <>
                <p className="text-muted rounded-pill border-line w-fit border px-3 py-1 text-xs font-bold">
                  {t(`certainty_${report.cause_certainty}`)}
                </p>
                <p className="max-w-prose text-base leading-relaxed">{report.report}</p>
              </>
            )}
            {rejection.meta_reason === null ? null : (
              <figure className="border-line flex flex-col gap-1 border-l-2 pl-4">
                <figcaption className="text-meta text-muted font-semibold">
                  {t('meta_reason_label')}
                </figcaption>
                <blockquote lang="en" className="text-meta text-muted break-words">
                  {rejection.meta_reason}
                </blockquote>
              </figure>
            )}
          </Card>

          {waiting ? null : (
            <Card className="flex flex-col gap-4">
              <Eyebrow>{t('section_culprit')}</Eyebrow>
              <CulpritBlock rejection={rejection} copy={copy} />
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
          <Card className="flex flex-col gap-4">
            <Eyebrow>{t('section_fix')}</Eyebrow>
            {sent || apply.isSuccess ? (
              <div role="status" className="flex flex-col gap-1">
                <p className="font-semibold">{t('applied_title')}</p>
                <p className="text-meta text-muted">{t('applied_body')}</p>
              </div>
            ) : waiting ? (
              <p className="text-meta text-muted">{t('pending_body')}</p>
            ) : report !== null && !report.can_fix ? (
              <div className="flex flex-col gap-1">
                <p className="font-semibold">{t('prohibited_title')}</p>
                <p className="text-meta text-muted">{t('prohibited_body')}</p>
                <p className="text-meta text-muted">{t('no_republish')}</p>
              </div>
            ) : fix === null ? (
              <p className="text-muted">{t('fix_none')}</p>
            ) : (
              <FixDiff
                field={fix.field}
                original={fix.original ?? (fixField === null ? null : copy[fixField])}
                suggested={fix.suggested}
                manual={fixField === null}
              />
            )}

            {failure === null ? null : (
              <div role="alert" className="flex flex-col gap-1">
                <p className="text-error font-semibold">
                  {failure === 'other' ? t('nothing_changed') : t(`error_${failure}`)}
                </p>
                {failure === 'other' ? null : (
                  <p className="text-meta text-muted">{t('nothing_changed')}</p>
                )}
              </div>
            )}
            {control.isError ? (
              <p role="alert" className="text-error font-semibold">
                {t('nothing_changed')}
              </p>
            ) : null}

            {sent || apply.isSuccess ? (
              <Button asChild>
                <Link href={`/campagnes/${campaignId}`}>{t('see_campaign')}</Link>
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                {canApply ? (
                  <Button
                    type="button"
                    disabled={apply.isPending}
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    {apply.isPending ? t('applying') : t('apply')}
                  </Button>
                ) : null}
                {!canAct ? <p className="text-meta text-muted">{t('viewer')}</p> : null}
                {canAct && !writable ? (
                  <p className="text-meta text-muted">{t('read_only')}</p>
                ) : null}
                {report !== null && !report.can_fix && !failed ? null : (
                  <>
                    {canAct && writable && !waiting ? (
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={control.isPending}
                        onClick={editMyself}
                      >
                        {t('edit_myself')}
                      </Button>
                    ) : null}
                    {(rejection.appeal_recommended || failed) && !waiting ? (
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() => {
                          setAppealOpen(true);
                        }}
                      >
                        {t('appeal')}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={common('close')}>
          <DialogTitle>{t('confirm_title')}</DialogTitle>
          <DialogDescription>{t('confirm_body')}</DialogDescription>
          <p className="text-meta text-muted mt-3">{t('confirm_warning')}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="quiet">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="button" onClick={publish}>
              {t('confirm_apply')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AppealGuide open={appealOpen} onOpenChange={setAppealOpen} />
    </div>
  );
}

/** La pub telle qu'elle est partie, avec l'élément en cause surligné (souligné épais ET en gras : jamais la couleur seule). */
function CulpritBlock({
  rejection,
  copy,
}: {
  rejection: Rejection;
  copy: Record<CopyField, string>;
}): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const culprit = rejection.report?.culprit ?? null;
  const place = culprit?.where ?? 'unknown';
  const textPlace = asCopyField(place);
  return (
    <div className="flex flex-col gap-4">
      {culprit === null ? null : (
        <p className="text-sm font-semibold">
          {t(`where_${place}`)}
          {culprit.excerpt !== null && textPlace === null ? (
            <span className="text-muted font-normal"> : « {culprit.excerpt} »</span>
          ) : null}
        </p>
      )}
      <div className="border-line bg-bg flex flex-col gap-3 rounded-md border p-4">
        <p className="text-meta text-muted font-semibold">{t('ad_as_sent')}</p>
        <dl className="flex flex-col gap-3">
          {(['primary_text', 'headline', 'description'] as const).map((field) => (
            <div key={field} className="flex flex-col gap-0.5">
              <dt className="text-meta text-muted">{t(`where_${field}`)}</dt>
              <dd className="break-words whitespace-pre-line">
                {copy[field] === '' ? (
                  <span className="text-muted">{t('empty_field')}</span>
                ) : field === textPlace ? (
                  <Highlighted text={copy[field]} excerpt={culprit?.excerpt ?? null} />
                ) : (
                  copy[field]
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {culprit === null ? null : place === 'visual' || place === 'landing_page' ? (
        <p className="text-meta text-muted">{t('culprit_not_text')}</p>
      ) : place === 'product' ? (
        <p className="text-meta text-muted">{t('culprit_product')}</p>
      ) : place === 'unknown' ? (
        <p className="text-meta text-muted">{t('culprit_unknown')}</p>
      ) : null}
    </div>
  );
}

function Highlighted({ text, excerpt }: { text: string; excerpt: string | null }): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const parts = splitAtExcerpt(text, excerpt);
  if (parts === null) return text;
  return (
    <>
      {parts.before}
      <mark className="decoration-warn text-ink bg-transparent font-bold underline decoration-[3px] underline-offset-4">
        <span className="sr-only">{t('section_culprit')} : </span>
        {parts.match}
      </mark>
      {parts.after}
    </>
  );
}

/** Avant / après : l'ancien texte barré, le nouveau sur une barre Lime. */
function FixDiff({
  field,
  original,
  suggested,
  manual,
}: {
  field: string;
  original: string | null;
  suggested: string;
  manual: boolean;
}): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const known = asCopyField(field);
  const fieldLabel = known === null ? t('where_unknown') : t(`where_${known}`);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-muted">
        {manual ? t('fix_manual', { field: fieldLabel }) : t('fix_target', { field: fieldLabel })}
      </p>
      {original === null || manual ? null : (
        <div className="flex flex-col gap-1">
          <p className="text-meta text-muted font-semibold">{t('fix_before')}</p>
          <p className="text-muted break-words line-through decoration-1">{original}</p>
        </div>
      )}
      <div className="border-accent flex flex-col gap-1 border-l-4 pl-3">
        <p className="text-meta text-muted font-semibold">{t('fix_after')}</p>
        <p className="font-semibold break-words whitespace-pre-line">{suggested}</p>
      </div>
    </div>
  );
}

/** La démarche de Meta pour un nouvel examen (page d'aide officielle de Meta) : aucune action n'est faite à la place du client. */
function AppealGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const t = useTranslations('campaigns.rejection');
  const common = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={common('close')}>
        <DialogTitle>{t('appeal_title')}</DialogTitle>
        <DialogDescription>{t('appeal_intro')}</DialogDescription>
        <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{t('appeal_step_1')}</li>
          <li>{t('appeal_step_2')}</li>
          <li>{t('appeal_step_3')}</li>
          <li>{t('appeal_step_4')}</li>
        </ol>
        <p className="text-meta text-muted mt-3">{t('appeal_delay')}</p>
        <p className="mt-2 text-sm font-semibold">{t('appeal_warning')}</p>
        <a
          href={META_HELP_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-meta mt-3 inline-block underline underline-offset-2"
        >
          {t('appeal_source')}
        </a>
        <div className="mt-5 flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="quiet">
              {t('appeal_done')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
