'use client';
// Étape « Proposition » (APPFLOW §8.3) : la proposition du Stratège s'écrit sous les yeux (champs qui se remplissent), avec des
// onglets « Proposition 1, 2, 3 », [Modifier], [Autre proposition] et [Continuer]. Le serveur est la seule vérité : la campagne et
// les propositions sont lues par TanStack Query ; l'aperçu du flux est un état d'interface passager, jamais enregistré.
import { Button, Card, Eyebrow, cn } from '@pubeka/ui';
import { AlertTriangle, Check } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { CostPanel } from './cost-panel';
import {
  StreamEndedError,
  useCampaign,
  useChooseProposal,
  useCreateDraft,
  useGenerateProposal,
  useProposals,
  useUpdateCampaign,
  campaignKey,
  type Campaign,
  type Proposal,
} from './proposal-api';
import { clearPendingKey, loadPendingKey, savePendingKey } from './proposal-key';
import { ProposalCard } from './proposal-card';
import { fromCampaign, fromPreview, fromProposal, type Display } from './proposal-display';
import { ProposalForm } from './proposal-form';
import { applyField, buildPatch, formFromCampaign, type Preview } from './proposal-model';
import { useQueryClient } from '@tanstack/react-query';

export interface ProposalStepProps {
  workspaceId: string;
  analysisId: string;
  pageId: string | null;
  campaignId: string | null;
  onCampaign: (campaignId: string) => void;
  onBack: () => void;
}

type ErrorKey =
  | 'stream_failed'
  | 'stream_ended'
  | 'rate_limited'
  | 'in_progress'
  | 'not_ready'
  | 'create_failed'
  | 'choose_failed'
  | 'save_failed'
  | 'server_validation';

function generationError(error: unknown): ErrorKey {
  if (error instanceof StreamEndedError) return 'stream_ended';
  if (error instanceof ApiError) {
    if (error.code === 'rate_limited') return 'rate_limited';
    if (error.code === 'conflict')
      return error.problem?.meta?.reason === 'generation_in_progress' ? 'in_progress' : 'not_ready';
  }
  return 'stream_failed';
}

/** Issue incertaine : on renvoie avec la MÊME clé (le serveur rejoue la même génération au lieu d'en lancer une autre). */
function keepsKey(error: unknown): boolean {
  if (error instanceof StreamEndedError) return true;
  if (error instanceof ApiError)
    return error.code === 'conflict' && error.problem?.meta?.reason === 'generation_in_progress';
  return true; // coupure réseau avant toute réponse
}

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

export function ProposalStep({
  workspaceId,
  analysisId,
  pageId,
  campaignId,
  onCampaign,
  onBack,
}: ProposalStepProps): ReactNode {
  const t = useTranslations('campaign.wizard.proposal');
  const common = useTranslations('common');
  const client = useQueryClient();
  const campaignQuery = useCampaign(workspaceId, campaignId);
  const proposalsQuery = useProposals(workspaceId, campaignId);
  const createDraft = useCreateDraft(workspaceId);
  const generate = useGenerateProposal(workspaceId);
  const [selected, setSelected] = useQueryState('proposition', parseAsInteger);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [retained, setRetained] = useState(false);
  // Une clé par intention : gardée tant que la génération n'est pas terminée, pour la reprendre sans doublon (API_SPEC §7).
  const pendingKey = useRef<string | null>(null);

  const targetCampaign = campaignId ?? '';
  const choose = useChooseProposal(workspaceId, targetCampaign);
  const update = useUpdateCampaign(workspaceId, targetCampaign);

  const campaign: Campaign | undefined = campaignQuery.data;
  const proposals: Proposal[] = proposalsQuery.data ?? [];
  const current: Proposal | undefined =
    proposals.find((p) => p.version === selected) ?? proposals.at(-1);
  const generating = preview !== null;
  const isChosen =
    campaign !== undefined &&
    current !== undefined &&
    campaign.chosen_proposal_version === current.version;

  async function run(id: string): Promise<void> {
    pendingKey.current ??= loadPendingKey(id) ?? crypto.randomUUID();
    savePendingKey(id, pendingKey.current);
    setError(null);
    setPreview({});
    setRewriting(false);
    try {
      const done = await generate.mutateAsync({
        campaignId: id,
        key: pendingKey.current,
        onEvent: (event) => {
          if (event.type === 'field')
            setPreview((p) => applyField(p ?? {}, event.path, event.value));
          if (event.type === 'retry') {
            setPreview({});
            setRewriting(true);
          }
        },
      });
      pendingKey.current = null;
      clearPendingKey(id);
      await setSelected(done.version);
      setRetained(false);
    } catch (e) {
      // La clé est gardée tant que l'issue est INCERTAINE (coupure, génération encore en cours, réponse illisible) : le renvoi
      // reprend la même génération, sans seconde dépense. Un refus net du serveur en demandera une nouvelle.
      if (!keepsKey(e)) {
        pendingKey.current = null;
        clearPendingKey(id);
      }
      setError(generationError(e));
    } finally {
      setPreview(null);
      setRewriting(false);
    }
  }

  async function start(): Promise<void> {
    setError(null);
    if (campaignId !== null) {
      await run(campaignId);
      return;
    }
    try {
      const draft = await createDraft.mutateAsync({ analysisId, pageId });
      onCampaign(draft.id);
      await run(draft.id);
    } catch {
      setError('create_failed');
    }
  }

  async function ensureChosen(): Promise<boolean> {
    if (current === undefined || campaign === undefined) return false;
    if (isChosen) return true;
    try {
      await choose.mutateAsync({
        proposalVersion: current.version,
        campaignVersion: campaign.version,
      });
      return true;
    } catch (e) {
      // Le brouillon a changé ailleurs depuis notre lecture : rien n'est écrasé, on propose de recharger.
      if (e instanceof ApiError && e.code === 'conflict') {
        setConflict(true);
        return false;
      }
      setError(
        e instanceof ApiError && e.code === 'validation_failed'
          ? 'server_validation'
          : 'choose_failed',
      );
      return false;
    }
  }

  async function onContinue(): Promise<void> {
    setError(null);
    if (await ensureChosen()) setRetained(true);
  }

  async function onEdit(): Promise<void> {
    setError(null);
    if (await ensureChosen()) setEditing(true);
  }

  // ---- Rendu ----------------------------------------------------------------------------------------------------------------

  const header = (
    <header className="flex flex-col gap-2">
      <h1 id="proposal-title" className="text-2xl font-bold">
        {t('title')}
      </h1>
      <p className="text-muted">{t('body')}</p>
    </header>
  );

  // Pendant la modification, l'erreur d'enregistrement s'affiche dans le formulaire (pas deux fois).
  const bannerError =
    editing && (error === 'save_failed' || error === 'server_validation') ? null : error;
  const errorBanner =
    bannerError === null ? null : (
      <div
        role="alert"
        className="border-error text-error flex items-start gap-2 rounded-md border-2 p-4 font-semibold"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-2">
          <p>{t(`errors.${bannerError}`)}</p>
          {bannerError === 'stream_failed' ||
          bannerError === 'stream_ended' ||
          bannerError === 'in_progress' ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="self-start"
              onClick={() => void start()}
            >
              {common('retry')}
            </Button>
          ) : null}
        </div>
      </div>
    );

  if (campaignId !== null && campaignQuery.isError && campaign === undefined) {
    return (
      <section className="flex flex-col gap-6">
        {header}
        <Card role="alert" className="flex flex-col gap-3">
          <p className="text-error font-semibold">{t('errors.load_failed')}</p>
          <Button
            type="button"
            variant="quiet"
            className="self-start"
            onClick={() => void campaignQuery.refetch()}
          >
            {common('retry')}
          </Button>
        </Card>
      </section>
    );
  }

  // Écriture en cours : la fiche se remplit.
  if (generating) {
    return (
      <section className="flex flex-col gap-6" aria-labelledby="proposal-title">
        {header}
        <Card className="flex flex-col gap-4" aria-busy="true">
          <Eyebrow>{t('by_ai', { n: proposals.length + 1 })}</Eyebrow>
          <p role="status" className="font-semibold">
            {rewriting ? t('writing_retry') : t('writing')}
            <span className="sr-only"> {t('writing_status')}</span>
          </p>
          <ProposalCard display={fromPreview(preview)} pending />
          <p className="text-meta text-muted">{t('preview_note')}</p>
        </Card>
      </section>
    );
  }

  // Aucune proposition encore : l'action qui dépense est un clic explicite.
  if (current === undefined) {
    const loading = campaignId !== null && (campaignQuery.isPending || proposalsQuery.isPending);
    return (
      <section className="flex flex-col gap-6">
        {header}
        {errorBanner}
        <Card className="flex flex-col gap-4">
          <Button
            type="button"
            className="w-full sm:w-auto sm:self-start"
            disabled={loading || createDraft.isPending}
            onClick={() => void start()}
          >
            {createDraft.isPending ? common('loading') : t('actions.generate_first')}
          </Button>
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto sm:self-start"
            onClick={onBack}
          >
            {common('back')}
          </Button>
        </Card>
      </section>
    );
  }

  const display: Display = isChosen
    ? fromCampaign(campaign, current.proposal)
    : fromProposal(current.proposal, current.cost.daily);
  const cost = isChosen ? campaign.cost : current.cost;
  const form = campaign === undefined ? null : formFromCampaign(campaign);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="proposal-title">
      {header}

      {conflict ? (
        <div role="alert" className="border-error flex flex-col gap-2 rounded-md border-2 p-4">
          <p className="text-error font-semibold">{t('errors.conflict_title')}</p>
          <p className="text-meta">{t('errors.conflict_body')}</p>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="self-start"
            onClick={() => {
              setConflict(false);
              setEditing(false);
              void client.invalidateQueries({ queryKey: campaignKey(workspaceId, targetCampaign) });
            }}
          >
            {t('actions.reload')}
          </Button>
        </div>
      ) : null}
      {errorBanner}

      {proposals.length > 1 ? (
        <div
          role="tablist"
          aria-label={t('tabs_label')}
          className="border-line flex gap-1 overflow-x-auto border-b"
        >
          {proposals.map((p) => (
            <button
              key={p.version}
              type="button"
              role="tab"
              id={`proposal-tab-${String(p.version)}`}
              aria-selected={p.version === current.version}
              aria-controls="proposal-panel"
              onClick={() => {
                setEditing(false);
                setRetained(false);
                void setSelected(p.version);
              }}
              className={cn(
                '-mb-px min-h-11 shrink-0 border-b-2 px-4 text-base whitespace-nowrap',
                p.version === current.version
                  ? 'border-ink font-bold'
                  : 'text-muted border-transparent',
              )}
            >
              {t('tab', { n: p.version })}
              {campaign?.chosen_proposal_version === p.version ? (
                <>
                  {' '}
                  <Check aria-hidden="true" className="inline size-4" />
                  <span className="sr-only"> {t('chosen')}</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <Card
        id="proposal-panel"
        {...(proposals.length > 1
          ? { role: 'tabpanel', 'aria-labelledby': `proposal-tab-${String(current.version)}` }
          : {})}
        className="flex flex-col gap-5"
      >
        {editing && form !== null && campaign !== undefined ? (
          <ProposalForm
            initial={form}
            today={localToday()}
            fx={campaign.cost.fx ?? null}
            pending={update.isPending}
            serverError={
              error === 'save_failed' || error === 'server_validation' ? t(`errors.${error}`) : null
            }
            onCancel={() => {
              setEditing(false);
            }}
            onSubmit={(values) => {
              const patch = buildPatch(values, campaign);
              if (patch === null) {
                setEditing(false);
                return;
              }
              setError(null);
              update.mutate(patch, {
                onSuccess: () => {
                  setEditing(false);
                },
                onError: (e) => {
                  if (e instanceof ApiError && e.code === 'conflict') setConflict(true);
                  else
                    setError(
                      e instanceof ApiError && e.code === 'validation_failed'
                        ? 'server_validation'
                        : 'save_failed',
                    );
                },
              });
            }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>{t('by_ai', { n: current.version })}</Eyebrow>
              {isChosen ? (
                <span className="text-meta flex items-center gap-1 font-semibold">
                  <Check aria-hidden="true" className="size-4" />
                  {t('chosen')}
                </span>
              ) : null}
            </div>
            <ProposalCard display={display} pending={false} />
            {display.warnings.length === 0 ? null : (
              <div role="note" className="border-line bg-bg rounded-md border p-4">
                <p className="text-meta font-semibold">{t('warnings_title')}</p>
                <ul className="text-meta text-muted mt-1 list-disc pl-5">
                  {display.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <CostPanel cost={cost} />
          </>
        )}
      </Card>

      {retained && !editing ? (
        <Card role="status" className="flex flex-col gap-1">
          <p className="text-title flex items-center gap-2 font-semibold">
            <Check aria-hidden="true" className="size-5" />
            {t('retained.title')}
          </p>
          <p className="text-muted">{t('retained.body')}</p>
        </Card>
      ) : null}

      {editing ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={choose.isPending}
            onClick={() => void onContinue()}
          >
            {choose.isPending ? t('actions.choosing') : t('actions.continue')}
          </Button>
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
            disabled={choose.isPending}
            onClick={() => void onEdit()}
          >
            {t('actions.edit')}
          </Button>
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
            onClick={() => {
              pendingKey.current = null;
              clearPendingKey(targetCampaign);
              void run(targetCampaign);
            }}
          >
            {t('actions.other')}
          </Button>
        </div>
      )}
      {!editing && (campaign?.chosen_proposal_version ?? null) !== null && !isChosen ? (
        <p className="text-meta text-muted">{t('form.replace_warning')}</p>
      ) : null}
      <Button type="button" variant="quiet" size="sm" className="self-start" onClick={onBack}>
        {common('back')}
      </Button>
    </section>
  );
}
