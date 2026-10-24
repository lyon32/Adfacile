'use client';
// Onglet « Résultats » (APPFLOW §11.3) : le résultat principal traduit en argent, le graphique, les statistiques détaillées
// repliées, « Actualiser ». Mis à jour toutes les heures par le serveur ; l'écran se rafraîchit seul (sans recharger).
// Limite de débit de Meta (EC-META-10) : les dernières valeurs restent, avec l'heure de la dernière mise à jour.
import { Button, Card } from '@pubeka/ui';
import { RefreshCw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import {
  isAwaitingCopy,
  REFRESH_WAIT_MAX_MS,
  useCampaignStats,
  useRefreshStats,
  type CampaignStatus,
} from './api';
import { controlFailureOf } from './control-errors';
import { FxAttribution, moneyText, useUiLocale } from './money';
import { ResultsChart } from './results-chart';
import { ResultSentence } from './status';
import { localTimeZone } from './time';

export function ResultsTab({
  workspaceId,
  campaignId,
  status,
}: {
  workspaceId: string;
  campaignId: string;
  status: CampaignStatus;
}): ReactNode {
  const t = useTranslations('campaigns.results');
  const errors = useTranslations('campaigns.errors');
  const format = useFormatter();
  const locale = useUiLocale();
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  // Délai maximum d'attente : passé ce délai l'écran reprend la main, même sans réponse (se synchronise avec une minuterie extérieure).
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (requestedAt === null) return undefined;
    const timer = setTimeout(() => {
      setExpired(true);
    }, REFRESH_WAIT_MAX_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [requestedAt]);
  const stats = useCampaignStats(workspaceId, campaignId, requestedAt);
  const refresh = useRefreshStats(workspaceId, campaignId);
  const data = stats.data;

  if (data === undefined) {
    return stats.isError ? (
      <Card role="alert" className="flex flex-col gap-3">
        <p className="text-error font-semibold">{t('load_failed')}</p>
        <Button
          type="button"
          variant="quiet"
          className="self-start"
          onClick={() => {
            void stats.refetch();
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

  const waiting = !expired && isAwaitingCopy(requestedAt, data);
  const failure = refresh.isError ? controlFailureOf(refresh.error) : null;
  const notPublished =
    refresh.error instanceof ApiError &&
    refresh.error.problem?.meta?.reason === 'not_published_on_meta';
  const never = status === 'draft' || status === 'publishing' || status === 'error';
  const summary = data.summary;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="tracking-eyebrow text-muted text-xs font-bold uppercase">
              {t('main_title')}
            </h2>
            <p className="text-2xl font-bold sm:text-3xl" data-testid="result-sentence">
              <ResultSentence
                count={summary.results}
                kind={summary.result_kind}
                costPerResult={summary.cost_per_result}
              />
            </p>
            <p className="text-meta text-muted tabular-nums">
              {t('spent', { amount: moneyText(summary.spend, locale) })}
            </p>
          </div>
          {never ? null : (
            <div className="flex flex-col gap-1 sm:items-end">
              <Button
                type="button"
                variant="quiet"
                disabled={refresh.isPending || waiting}
                onClick={() => {
                  refresh.mutate(undefined, {
                    onSuccess: (done) => {
                      setExpired(false);
                      setRequestedAt(done.requested_at);
                    },
                  });
                }}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={waiting ? 'animate-spin motion-reduce:animate-none' : ''}
                />
                {waiting ? t('refreshing') : t('refresh')}
              </Button>
              <p className="text-meta text-muted tabular-nums" aria-live="polite">
                {data.synced_at === null
                  ? t('never_synced')
                  : t('updated', {
                      time: format.dateTime(new Date(data.synced_at), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: localTimeZone(),
                      }),
                    })}
              </p>
            </div>
          )}
        </div>

        {data.sync_error === null ? null : (
          <p role="status" className="text-meta font-semibold">
            {t(`sync_error.${data.sync_error}`)}
          </p>
        )}
        {failure === null ? null : (
          <p role="alert" className="text-error text-sm font-semibold">
            {failure.kind === 'rate_limited'
              ? t('refresh_limited', {
                  minutes: Math.max(1, Math.ceil((failure.retryAfterS ?? 300) / 60)),
                })
              : notPublished
                ? t('not_published')
                : errors(failure.kind)}
          </p>
        )}

        <ResultsChart
          label={t('chart_label')}
          valueLabel={t('chart_value')}
          points={data.daily.map((day) => ({ date: day.date, value: day.results }))}
        />
        <FxAttribution fx={data.fx} />
      </Card>

      <details className="border-line bg-panel rounded-lg border p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">{t('details')}</summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {(
            [
              ['reach', format.number(summary.reach)],
              ['impressions', format.number(summary.impressions)],
              ['clicks', format.number(summary.clicks)],
              [
                'ctr',
                summary.ctr === null
                  ? '—'
                  : `${format.number(summary.ctr, { maximumFractionDigits: 2 })} %`,
              ],
              ['cpm', summary.cpm === null ? '—' : moneyText(summary.cpm, locale)],
              [
                'frequency',
                summary.frequency === null
                  ? '—'
                  : format.number(summary.frequency, { maximumFractionDigits: 2 }),
              ],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <dt className="text-meta text-muted">{t(`metric_${key}`)}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-meta text-muted mt-3">{t('reach_note')}</p>
      </details>
    </div>
  );
}
