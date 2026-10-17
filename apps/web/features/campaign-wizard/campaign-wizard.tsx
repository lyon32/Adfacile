'use client';
// Assistant de création de campagne `/campagnes/nouvelle` (APPFLOW §8). S14 : étapes « Sources » et « Questions ».
// L'analyse suivie est celle de l'adresse (`?analyse=…`) : un rechargement ou un retour arrière retrouve la même étape.
import { Button, buttonVariants, Card, cn } from '@pubeka/ui';
import { parseAsString, useQueryState } from 'nuqs';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useConnections } from '../meta-connection/api';
import { useAnalysis } from './api';
import { BlockedPanel, FailedPanel } from './outcome-panels';
import { PreviewStep } from './preview-step';
import { ProposalStep } from './proposal-step';
import { PublishStep } from './publish-step';
import { QuestionsStep } from './questions-step';
import { SourcesStep } from './sources-step';
import { Stepper, type WizardStep } from './stepper';
import { WaitingPanel } from './waiting-panel';

export interface CampaignWizardProps {
  workspace: {
    id: string;
    role: 'owner' | 'editor' | 'viewer';
    status: 'active' | 'read_only' | 'suspended';
  } | null;
}

function Shell({ step, children }: { step: WizardStep; children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <Stepper current={step} />
      {children}
    </div>
  );
}

function Gate({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <Card className="flex flex-col gap-2" role="status">
        <h1 className="text-title text-xl font-bold">{title}</h1>
        <p className="text-muted">{body}</p>
      </Card>
    </div>
  );
}

/** APPFLOW §8.0 : Meta non connecté → on peut quand même préparer la campagne. */
function MetaBanner({ workspaceId }: { workspaceId: string }): ReactNode {
  const t = useTranslations('campaign.wizard.entry');
  const connections = useConnections(workspaceId);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !connections.isSuccess) return null;
  if (connections.data.some((c) => c.status === 'ok' || c.status === 'expiring')) return null;
  return (
    <Card className="flex flex-col gap-3" role="status">
      <h2 className="text-title font-semibold">{t('meta_title')}</h2>
      <p className="text-meta text-muted">{t('meta_body')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/reglages/comptes-meta"
          className={cn(buttonVariants({ variant: 'primary' }), 'w-full sm:w-auto')}
        >
          {t('meta_connect')}
        </Link>
        <Button
          type="button"
          variant="quiet"
          className="w-full sm:w-auto"
          onClick={() => {
            setDismissed(true);
          }}
        >
          {t('meta_prepare')}
        </Button>
      </div>
    </Card>
  );
}

function AnalysisFlow({
  workspaceId,
  analysisId,
  onBack,
}: {
  workspaceId: string;
  analysisId: string;
  onBack: () => void;
}): ReactNode {
  const [stage, setStage] = useQueryState('etape', parseAsString);
  const [campaignId, setCampaignId] = useQueryState('campagne', parseAsString);
  const t = useTranslations('campaign.wizard.waiting');
  const common = useTranslations('common');
  const analysis = useAnalysis(workspaceId, analysisId);
  if (analysis.isError && analysis.data === undefined) {
    return (
      <Shell step="sources">
        <Card className="flex flex-col gap-3" role="alert">
          <p className="text-error font-semibold">{t('load_failed')}</p>
          <Button type="button" variant="quiet" className="self-start" onClick={onBack}>
            {common('back')}
          </Button>
        </Card>
      </Shell>
    );
  }
  const data = analysis.data;
  if (data === undefined) {
    return (
      <Shell step="sources">
        <WaitingPanel status="queued" />
      </Shell>
    );
  }
  switch (data.status) {
    case 'queued':
    case 'reading':
    case 'analysing':
      return (
        <Shell step="sources">
          <WaitingPanel status={data.status} />
        </Shell>
      );
    case 'blocked':
      return (
        <Shell step="sources">
          <BlockedPanel />
        </Shell>
      );
    case 'failed':
      return (
        <Shell step="sources">
          <FailedPanel analysis={data} onBack={onBack} />
        </Shell>
      );
    case 'questions':
    case 'ready':
      if (
        (stage === 'apercu' || stage === 'publier') &&
        data.status === 'ready' &&
        campaignId !== null
      ) {
        return (
          <Shell step={stage === 'apercu' ? 'preview' : 'publish'}>
            {stage === 'apercu' ? (
              <PreviewStep
                workspaceId={workspaceId}
                campaignId={campaignId}
                onBack={() => {
                  void setStage('proposition');
                }}
                onNext={() => {
                  void setStage('publier');
                }}
                onSources={onBack}
              />
            ) : (
              <PublishStep
                workspaceId={workspaceId}
                campaignId={campaignId}
                onBackToPreview={() => {
                  void setStage('apercu');
                }}
                onBackToProposal={() => {
                  void setStage('proposition');
                }}
                onSources={onBack}
              />
            )}
          </Shell>
        );
      }
      if (stage === 'proposition' && data.status === 'ready') {
        return (
          <Shell step="proposal">
            <ProposalStep
              workspaceId={workspaceId}
              analysisId={analysisId}
              pageId={data.page_id ?? null}
              campaignId={campaignId}
              onCampaign={(id) => {
                void setCampaignId(id);
              }}
              onBack={() => {
                void setStage(null);
              }}
              onNext={() => {
                void setStage('apercu');
              }}
            />
          </Shell>
        );
      }
      return (
        <Shell step="questions">
          <QuestionsStep
            workspaceId={workspaceId}
            analysis={data}
            onBack={onBack}
            onContinue={() => {
              void setStage('proposition');
            }}
          />
        </Shell>
      );
  }
}

export function CampaignWizard({ workspace }: CampaignWizardProps): ReactNode {
  const t = useTranslations('campaign.wizard.entry');
  const [analysisId, setAnalysisId] = useQueryState('analyse', parseAsString);

  if (workspace === null) return <Gate title={t('no_workspace')} body="" />;
  if (workspace.status === 'suspended') {
    return <Gate title={t('suspended_title')} body={t('suspended_body')} />;
  }
  if (workspace.status === 'read_only') {
    return <Gate title={t('readonly_title')} body={t('readonly_body')} />;
  }
  if (workspace.role === 'viewer')
    return <Gate title={t('viewer_title')} body={t('viewer_body')} />;

  const backToSources = (): void => {
    void setAnalysisId(null);
  };

  if (analysisId !== null) {
    return (
      <AnalysisFlow workspaceId={workspace.id} analysisId={analysisId} onBack={backToSources} />
    );
  }
  return (
    <Shell step="sources">
      <MetaBanner workspaceId={workspace.id} />
      <SourcesStep
        workspaceId={workspace.id}
        onStarted={(id) => {
          // Le brouillon est gardé en mémoire : « Modifier mes sources » le retrouve (jamais écrit dans le navigateur).
          void setAnalysisId(id);
        }}
      />
    </Shell>
  );
}
