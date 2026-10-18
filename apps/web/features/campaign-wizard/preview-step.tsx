'use client';
// Étape « Aperçu » (APPFLOW §8.5, PRD F3 et F6) : la pub dans ses cinq emplacements, le récapitulatif (objectif, zone, budget, dates,
// coût total sans TVA avec le lien d'attribution des taux), l'estimation de portée DE META (jamais un chiffre de Pubeka) et ce qui
// bloque la publication (photo). L'aperçu est construit par Pubeka : il le dit. Tout vient du serveur (LLD §7.1).
import { Button, Card, cn } from '@pubeka/ui';
import { Info } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AdPreview } from './ad-preview';
import { CostPanel } from './cost-panel';
import { adjustedCities, PLACEMENTS, isVertical, type Placement } from './preview-model';
import { ProposalCard } from './proposal-card';
import { fromCampaign } from './proposal-display';
import { useCampaign } from './proposal-api';
import { useReachEstimate, useReadiness, type Estimate, type Readiness } from './publish-api';

export interface PreviewStepProps {
  workspaceId: string;
  campaignId: string;
  onBack: () => void;
  onNext: () => void;
  onSources: () => void;
}

function Tabs({
  id,
  value,
  onChange,
}: {
  /** Préfixe partagé avec le panneau : `aria-controls` doit viser un élément qui existe. */
  id: string;
  value: Placement;
  onChange: (placement: Placement) => void;
}): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = PLACEMENTS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % PLACEMENTS.length
        : event.key === 'ArrowLeft'
          ? (index + last) % PLACEMENTS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = PLACEMENTS[next];
    if (target === undefined) return;
    onChange(target);
    refs.current[target]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t('tabs_label')}
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {PLACEMENTS.map((placement, index) => {
        const selected = placement === value;
        return (
          <button
            key={placement}
            ref={(node) => {
              refs.current[placement] = node;
            }}
            id={`${id}-${placement}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(placement);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className={cn(
              'min-h-11 shrink-0 rounded-md border px-4 text-sm font-semibold transition-colors motion-reduce:transition-none',
              selected ? 'border-ink bg-ink text-bg' : 'border-field-line text-ink hover:bg-panel',
            )}
          >
            {t(`tabs.${placement}`)}
          </button>
        );
      })}
    </div>
  );
}

function EstimatePanel({
  estimate,
  loading,
}: {
  estimate: Estimate | undefined;
  loading: boolean;
}): ReactNode {
  const t = useTranslations('campaign.wizard.preview.estimate');
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR');
  return (
    <section
      aria-labelledby="estimate-title"
      className="border-line flex flex-col gap-2 border-t pt-5"
    >
      <h2 id="estimate-title" className="tracking-eyebrow text-muted text-xs font-bold uppercase">
        {t('title')}
      </h2>
      {loading ? (
        <p role="status" className="text-muted">
          {t('loading')}
        </p>
      ) : estimate?.status === 'ok' && estimate.audience !== null ? (
        <>
          <p className="text-title text-xl font-bold tabular-nums">
            {t('range', {
              lower: number.format(estimate.audience.lower),
              upper: number.format(estimate.audience.upper),
            })}
          </p>
          <p className="text-meta text-muted">{t('explain')}</p>
        </>
      ) : (
        // Aucune estimation : AUCUN chiffre (décision du 16/10/2026).
        <p className="text-meta text-muted flex items-start gap-2">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('unavailable')}
        </p>
      )}
    </section>
  );
}

function PhotoBlock({
  status,
  onSources,
}: {
  status: Exclude<Readiness['visual']['status'], 'ready'>;
  onSources: () => void;
}): ReactNode {
  const t = useTranslations('campaign.wizard.preview.photo_block');
  return (
    <Card role="alert" className="flex flex-col gap-2">
      <h2 className="text-title font-semibold">
        {t(status === 'missing' ? 'missing_title' : 'expired_title')}
      </h2>
      <p className="text-muted">{t(status === 'missing' ? 'missing_body' : 'expired_body')}</p>
      <Button type="button" variant="quiet" className="self-start" onClick={onSources}>
        {t('action')}
      </Button>
    </Card>
  );
}

export function PreviewStep({
  workspaceId,
  campaignId,
  onBack,
  onNext,
  onSources,
}: PreviewStepProps): ReactNode {
  const t = useTranslations('campaign.wizard.preview');
  const proposal = useTranslations('campaign.wizard.proposal');
  const common = useTranslations('common');
  const campaign = useCampaign(workspaceId, campaignId);
  const readiness = useReadiness(workspaceId, campaignId);
  const estimate = useReachEstimate(workspaceId, campaignId);
  const [placement, setPlacement] = useState<Placement>('facebook_feed');
  const panelId = useId();

  if (campaign.isError || readiness.isError) {
    return (
      <Card role="alert" className="flex flex-col gap-3">
        <p className="text-error font-semibold">{t('load_failed')}</p>
        <Button type="button" variant="quiet" className="self-start" onClick={onBack}>
          {common('back')}
        </Button>
      </Card>
    );
  }
  if (campaign.data === undefined || readiness.data === undefined) {
    return (
      <p role="status" className="text-muted">
        {t('loading')}
      </p>
    );
  }
  const data = campaign.data;
  const ready = readiness.data;
  const display = fromCampaign(data, null);
  const radius = adjustedCities(ready.cities);
  const photoReady = ready.visual.status === 'ready';

  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="preview-title" className="text-2xl font-bold">
          {t('title')}
        </h1>
        <p className="text-muted">{t('body')}</p>
      </header>

      {photoReady ? null : (
        <PhotoBlock
          status={ready.visual.status === 'ready' ? 'missing' : ready.visual.status}
          onSources={onSources}
        />
      )}

      <div className="flex flex-col gap-4">
        <Tabs id={panelId} value={placement} onChange={setPlacement} />
        <div
          id={`${panelId}-panel`}
          role="tabpanel"
          aria-labelledby={`${panelId}-${placement}`}
          className="bg-panel flex flex-col gap-3 rounded-lg p-4"
        >
          <AdPreview
            placement={placement}
            pageName={ready.page?.name ?? null}
            primaryText={display.primaryText ?? ''}
            headline={display.headline ?? ''}
            description={display.description}
            ctaLabel={display.cta === null ? '' : proposal(`ctas.${display.cta}`)}
            imageUrl={ready.visual.url}
          />
          {isVertical(placement) ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-meta text-muted">{t('vertical.notice')}</p>
              {/* Le format 9:16 dédié relève de l'étape Visuel (S22/S23) : l'état est affiché, rien n'est construit ici. */}
              <Button
                type="button"
                variant="quiet"
                size="sm"
                disabled
                aria-describedby={`${panelId}-soon`}
              >
                {t('vertical.create')}
              </Button>
              <p id={`${panelId}-soon`} className="text-meta text-muted">
                {t('vertical.soon')}
              </p>
            </div>
          ) : null}
        </div>
        <p className="text-meta text-muted">{t('disclosure')}</p>
      </div>

      <Card className="flex flex-col gap-5">
        <h2 className="text-title text-lg font-bold">{t('recap_title')}</h2>
        <ProposalCard display={display} pending={false} />
        {radius.length === 0 ? null : (
          <ul className="text-meta text-muted flex flex-col gap-1">
            {radius.map((city) => (
              <li key={city.name} className="flex items-start gap-2">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {t('radius_notice', {
                  city: city.name,
                  effective: city.effective_radius_km,
                  requested: city.radius_km,
                })}
              </li>
            ))}
          </ul>
        )}
        <CostPanel cost={data.cost} />
        <EstimatePanel estimate={estimate.data} loading={estimate.isPending} />
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="w-full sm:w-auto" disabled={!photoReady} onClick={onNext}>
          {t('actions.continue')}
        </Button>
        <Button type="button" variant="quiet" className="w-full sm:w-auto" onClick={onBack}>
          {t('actions.back')}
        </Button>
      </div>
    </section>
  );
}
