'use client';
// Pastille d'état d'une campagne et phrase du résultat. Les textes viennent de `t(…)` (FR et EN) ; les couleurs sont celles de
// `StatusBadge` (jetons du design system, jamais une couleur écrite ici). L'état n'est jamais dit par la couleur seule.
import { StatusBadge, type CampaignStatus as BadgeStatus } from '@pubeka/ui';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { CampaignStatus, ResultKind, StatsMoney } from './api';
import { moneyText, useUiLocale } from './money';
import { localTimeZone } from './time';

const BADGE: Record<CampaignStatus, BadgeStatus> = {
  draft: 'draft',
  publishing: 'in_review',
  in_review: 'in_review',
  active: 'active',
  paused: 'paused',
  rejected: 'rejected',
  ended: 'completed',
  stopped: 'rejected',
  error: 'rejected',
};

export function StatusPill({ status }: { status: CampaignStatus }): ReactNode {
  const t = useTranslations('campaigns.status');
  return <StatusBadge status={BADGE[status]} label={t(status)} />;
}

/** Phrase d'état sous le nom (APPFLOW §11.2). `pausedAt` : « Mise en pause par toi le JJ/MM ». */
export function useStatusMessage(): (
  status: CampaignStatus,
  dates: { pausedAt: string | null; endDate: string | null },
) => string {
  const t = useTranslations('campaigns.status_message');
  const format = useFormatter();
  const day = (iso: string): string =>
    format.dateTime(new Date(iso), {
      day: '2-digit',
      month: '2-digit',
      timeZone: localTimeZone(),
    });
  return (status, dates) => {
    if (status === 'paused') {
      return dates.pausedAt === null
        ? t('paused_plain')
        : t('paused', { date: day(dates.pausedAt) });
    }
    if (status === 'ended') {
      return dates.endDate === null ? t('ended_plain') : t('ended', { date: day(dates.endDate) });
    }
    return t(status);
  };
}

/** « 42 messages WhatsApp, soit 357 FCFA par client potentiel » (F7). Sans résultat : une phrase qui le dit. */
export function ResultSentence({
  count,
  kind,
  costPerResult,
}: {
  count: number;
  kind: ResultKind | null;
  costPerResult: StatsMoney | null;
}): ReactNode {
  const t = useTranslations('campaigns.result');
  const each = useTranslations('campaigns.result_each');
  const locale = useUiLocale();
  if (kind === null || count <= 0) return <>{t('none')}</>;
  return (
    <>
      {t(kind, { count })}
      {costPerResult === null
        ? null
        : `, ${each(kind, { amount: moneyText(costPerResult, locale) })}`}
    </>
  );
}
