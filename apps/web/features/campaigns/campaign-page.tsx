'use client';
// Page d'une campagne `/campagnes/{id}` (APPFLOW §11) : en-tête avec l'état et les actions (pause, reprise, relance), puis quatre
// onglets : Résultats, Pubs, Réglages, Historique. Tout vient du serveur via TanStack Query et se met à jour sans recharger.
// Meta est appelé d'abord par le serveur : un message d'erreur veut toujours dire « rien n'a changé » (EC-META-07).
import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseAsString, useQueryState } from 'nuqs';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { STATUSES, useCampaignDetail, useControlCampaign, type CampaignStatus } from './api';
import { controlFailureOf } from './control-errors';
import { RejectionBanner } from './rejection-banner';
import { AdsTab } from './tab-ads';
import { HistoryTab } from './tab-history';
import { ResultsTab } from './tab-results';
import { SettingsTab } from './tab-settings';
import { StatusPill, useStatusMessage } from './status';

export interface CampaignPageProps {
  workspace: { id: string; role: 'owner' | 'editor' | 'viewer'; status: string };
  campaignId: string;
}

const TABS = ['results', 'ads', 'settings', 'history'] as const;
type Tab = (typeof TABS)[number];

function asTab(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? 'results';
}

function asStatus(value: string): CampaignStatus {
  return STATUSES.find((status) => status === value) ?? 'error';
}

type Confirm = 'resume' | 'recover' | null;

export function CampaignPage({ workspace, campaignId }: CampaignPageProps): ReactNode {
  const t = useTranslations('campaigns.page');
  const errors = useTranslations('campaigns.errors');
  const router = useRouter();
  const [tabParam, setTabParam] = useQueryState('onglet', parseAsString);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const detail = useCampaignDetail(workspace.id, campaignId);
  const control = useControlCampaign(workspace.id, campaignId);
  const statusMessage = useStatusMessage();
  const tab = asTab(tabParam);

  if (detail.isError && detail.data === undefined) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Card role="alert" className="flex flex-col gap-3">
        <p className="text-error font-semibold">{notFound ? t('not_found') : t('load_failed')}</p>
        <Button asChild variant="quiet" className="self-start">
          <Link href="/campagnes">{t('back')}</Link>
        </Button>
      </Card>
    );
  }
  const campaign = detail.data;
  if (campaign === undefined) {
    return (
      <p role="status" className="text-meta text-muted">
        {t('loading')}
      </p>
    );
  }

  const status = asStatus(campaign.status);
  const canAct = workspace.role === 'owner' || workspace.role === 'editor';
  const writable = workspace.status === 'active';
  const failure = control.isError ? controlFailureOf(control.error) : null;
  const published = status !== 'draft' && status !== 'publishing' && status !== 'error';

  const run = (action: 'pause' | 'resume' | 'recover' | 'copy'): void => {
    setConfirm(null);
    control.mutate(
      { action, version: campaign.version },
      {
        onSuccess: (next) => {
          if (action !== 'copy') return;
          // La copie repart de l'aperçu (APPFLOW §11.4) ; sans analyse d'origine, de l'assistant.
          const analysis = next.analysis_id ?? campaign.analysis_id ?? null;
          router.push(
            analysis === null
              ? '/campagnes/nouvelle'
              : `/campagnes/nouvelle?analyse=${analysis}&campagne=${next.id}&etape=apercu`,
          );
        },
      },
    );
  };

  const pending = control.isPending;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/campagnes" className="text-meta text-muted w-fit underline underline-offset-2">
          {t('back')}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-bold break-words sm:text-3xl">{campaign.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={status} />
              <span className="text-meta text-muted">{t('platform_meta')}</span>
            </div>
            <p className="text-muted max-w-2xl text-sm" aria-live="polite">
              {statusMessage(status, {
                pausedAt: campaign.paused_at ?? null,
                endDate: campaign.end_date ?? null,
              })}
            </p>
          </div>

          {canAct && published ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {status === 'active' || status === 'in_review' ? (
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending}
                  onClick={() => {
                    run('pause');
                  }}
                >
                  {t('pause')}
                </Button>
              ) : null}
              {status === 'paused' ? (
                <Button
                  type="button"
                  disabled={pending || !writable}
                  onClick={() => {
                    setConfirm('resume');
                  }}
                >
                  {t('resume')}
                </Button>
              ) : null}
              {status === 'stopped' ? (
                <Button
                  type="button"
                  disabled={pending || !writable}
                  onClick={() => {
                    setConfirm('recover');
                  }}
                >
                  {t('relaunch')}
                </Button>
              ) : null}
              {status === 'ended' ? (
                <Button
                  type="button"
                  disabled={pending || !writable}
                  onClick={() => {
                    run('copy');
                  }}
                >
                  {t('relaunch')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending || !writable}
                  onClick={() => {
                    run('copy');
                  }}
                >
                  {t('duplicate')}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <RejectionBanner workspaceId={workspace.id} campaignId={campaignId} enabled={published} />
        {status === 'stopped' ? (
          <Card role="status" className="flex flex-col gap-1">
            <p className="font-semibold">{t('stopped_title')}</p>
            <p className="text-meta text-muted">{t('stopped_body')}</p>
          </Card>
        ) : null}
        {!writable && canAct && published ? (
          <p role="status" className="text-meta text-muted">
            {t('read_only')}
          </p>
        ) : null}
        {failure === null ? null : (
          <Card role="alert" className="flex flex-col gap-1">
            <p className="text-error font-semibold">{failure.metaTitle ?? errors(failure.kind)}</p>
            {failure.metaMessage === undefined ? null : (
              <p className="text-sm">{failure.metaMessage}</p>
            )}
            <p className="text-meta text-muted">{errors('nothing_changed')}</p>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label={t('tabs_label')}
          className="border-line flex gap-1 overflow-x-auto border-b"
        >
          {TABS.map((value) => (
            <button
              key={value}
              id={`tab-${value}`}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls={`panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => {
                void setTabParam(value === 'results' ? null : value);
              }}
              onKeyDown={(event) => {
                const index = TABS.indexOf(value);
                const next =
                  event.key === 'ArrowRight'
                    ? TABS[(index + 1) % TABS.length]
                    : event.key === 'ArrowLeft'
                      ? TABS[(index + TABS.length - 1) % TABS.length]
                      : undefined;
                if (next === undefined) return;
                event.preventDefault();
                void setTabParam(next === 'results' ? null : next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
              className={
                tab === value
                  ? 'border-ink text-ink min-h-11 shrink-0 border-b-2 px-4 text-sm font-bold'
                  : 'text-muted hover:text-ink min-h-11 shrink-0 border-b-2 border-transparent px-4 text-sm font-semibold'
              }
            >
              {t(`tab_${value}`)}
            </button>
          ))}
        </div>
        {TABS.map((value) => (
          <div
            key={value}
            id={`panel-${value}`}
            role="tabpanel"
            aria-labelledby={`tab-${value}`}
            hidden={tab !== value}
          >
            {tab !== value ? null : value === 'results' ? (
              <ResultsTab workspaceId={workspace.id} campaignId={campaignId} status={status} />
            ) : value === 'ads' ? (
              <AdsTab workspaceId={workspace.id} campaignId={campaignId} />
            ) : value === 'settings' ? (
              <SettingsTab campaign={campaign} />
            ) : (
              <HistoryTab workspaceId={workspace.id} campaignId={campaignId} />
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        kind={confirm}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={(kind) => {
          run(kind);
        }}
      />
    </div>
  );
}

function ConfirmDialog({
  kind,
  onCancel,
  onConfirm,
}: {
  kind: Confirm;
  onCancel: () => void;
  onConfirm: (kind: 'resume' | 'recover') => void;
}): ReactNode {
  const t = useTranslations('campaigns.confirm');
  const common = useTranslations('common');
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent closeLabel={common('close')}>
        <DialogTitle>{kind === 'recover' ? t('recover_title') : t('resume_title')}</DialogTitle>
        <DialogDescription>
          {kind === 'recover' ? t('recover_body') : t('resume_body')}
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
              if (kind !== null) onConfirm(kind);
            }}
          >
            {kind === 'recover' ? t('recover_confirm') : t('resume_confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
