'use client';
// Tableau de bord `/` (APPFLOW §7) : phrase d'état, bouton principal, graphique des résultats et tableau des campagnes (le bandeau
// de chiffres est celui du haut de la coque, `TopBanner`). Tout vient de la route `overview` (TanStack Query) et se met à jour sans recharger la page. Les états
// vides, d'erreur et de chargement sont dits (APPFLOW §7.2). Les crédits restants arrivent avec la facturation (S24).
import { Button, Card, CardDescription } from '@pubeka/ui';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useOverview, type Overview } from './api';
import { CampaignRows } from './campaign-rows';
import { localTimeZone } from './time';
import { FxAttribution } from './money';
import { ResultsChart } from './results-chart';

export interface DashboardProps {
  workspaceId: string;
  canCreate: boolean;
}

function SyncNotice({ overview }: { overview: Overview }): ReactNode {
  const t = useTranslations('campaigns.sync');
  const format = useFormatter();
  const limited = overview.campaigns.some((c) => c.sync_error === 'rate_limited');
  const stamps = overview.campaigns.flatMap((c) => (c.synced_at === null ? [] : [c.synced_at]));
  const latest = stamps.length === 0 ? null : stamps.reduce((a, b) => (a > b ? a : b));
  if (latest === null && !limited) return null;
  return (
    <p className="text-meta text-muted" role={limited ? 'status' : undefined}>
      {limited ? `${t('rate_limited')} ` : ''}
      {latest === null
        ? null
        : t('updated', {
            time: format.dateTime(new Date(latest), {
              timeStyle: 'short',
              timeZone: localTimeZone(),
            }),
          })}
    </p>
  );
}

function useStatusSummary(counts: Overview['counts']): string {
  const t = useTranslations('campaigns.dashboard.summary');
  const parts: string[] = [];
  if (counts.active > 0) parts.push(t('active', { count: counts.active }));
  if (counts.in_review > 0) parts.push(t('in_review', { count: counts.in_review }));
  if (counts.paused > 0) parts.push(t('paused', { count: counts.paused }));
  if (counts.stopped > 0) parts.push(t('stopped', { count: counts.stopped }));
  return parts.length === 0 ? t('none') : parts.join(', ');
}

function EmptyState({ canCreate }: { canCreate: boolean }): ReactNode {
  const t = useTranslations('dashboard.home');
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-title font-semibold">{t('first_campaign_title')}</h2>
      <CardDescription className="max-w-xl text-sm">{t('first_campaign_body')}</CardDescription>
      {canCreate ? (
        <Button asChild className="w-full sm:w-fit">
          <Link href="/campagnes/nouvelle">{t('first_campaign_cta')}</Link>
        </Button>
      ) : null}
    </Card>
  );
}

const EMPTY_COUNTS: Overview['counts'] = {
  active: 0,
  in_review: 0,
  paused: 0,
  stopped: 0,
  other: 0,
};

export function Dashboard({ workspaceId, canCreate }: DashboardProps): ReactNode {
  const t = useTranslations('campaigns.dashboard');
  const [range, setRange] = useState<'week' | 'month'>('week');
  const query = useOverview(workspaceId, range);
  const summary = useStatusSummary(query.data?.counts ?? EMPTY_COUNTS);
  const overview = query.data;

  if (overview === undefined) {
    return query.isError ? (
      <Card role="alert" className="flex flex-col gap-3">
        <p className="text-error font-semibold">{t('load_failed')}</p>
        <Button
          type="button"
          variant="quiet"
          className="self-start"
          onClick={() => {
            void query.refetch();
          }}
        >
          {t('retry')}
        </Button>
      </Card>
    ) : (
      <p role="status" className="text-meta text-muted">
        {t('loading')}
      </p>
    );
  }

  const published = overview.campaigns.filter((c) => c.status !== 'draft');
  if (overview.campaigns.length === 0) return <EmptyState canCreate={canCreate} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted max-w-xl text-sm" aria-live="polite">
          {summary}
        </p>
        {canCreate ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/campagnes/nouvelle">{t('new_campaign')}</Link>
          </Button>
        ) : null}
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-title font-semibold">{t('chart_title')}</h2>
          <div role="group" aria-label={t('range_label')} className="flex gap-2">
            {(['week', 'month'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={range === value ? 'secondary' : 'quiet'}
                aria-pressed={range === value}
                onClick={() => {
                  setRange(value);
                }}
              >
                {t(`range_${value}`)}
              </Button>
            ))}
          </div>
        </div>
        <ResultsChart
          label={t('chart_title')}
          valueLabel={t('chart_value')}
          points={overview.chart.map((day) => ({ date: day.date, value: day.results }))}
        />
      </Card>

      <section aria-labelledby="campaigns-title" className="flex flex-col gap-3">
        <h2 id="campaigns-title" className="text-title font-semibold">
          {t('table_title')}
        </h2>
        {published.length === 0 ? <p className="text-meta text-muted">{t('drafts_only')}</p> : null}
        <CampaignRows campaigns={overview.campaigns} />
        <FxAttribution fx={overview.fx} />
        <SyncNotice overview={overview} />
      </section>
    </div>
  );
}
