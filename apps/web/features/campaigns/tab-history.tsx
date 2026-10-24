'use client';
// Onglet « Historique » (APPFLOW §11.3) : publication, vérification, pauses, refus, signaux et corrections de Meta, du plus récent
// au plus ancien. Seuls des champs courts sortent du serveur (liste blanche) ; un statut inconnu garde un libellé neutre.
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCampaignEvents } from './api';
import { localTimeZone } from './time';

const KNOWN = [
  'publishing',
  'in_review',
  'active',
  'paused',
  'rejected',
  'ended',
  'stopped',
  'error',
  'in_process',
  'with_issues',
  'meta_status',
] as const;
type KnownStatus = (typeof KNOWN)[number];

function known(status: string): KnownStatus | null {
  return KNOWN.find((value) => value === status) ?? null;
}

export function HistoryTab({
  workspaceId,
  campaignId,
}: {
  workspaceId: string;
  campaignId: string;
}): ReactNode {
  const t = useTranslations('campaigns.history');
  const format = useFormatter();
  const events = useCampaignEvents(workspaceId, campaignId, true);
  if (events.data === undefined) {
    return events.isError ? (
      <p role="alert" className="text-error font-semibold">
        {t('load_failed')}
      </p>
    ) : (
      <p role="status" className="text-meta text-muted">
        {t('loading')}
      </p>
    );
  }
  if (events.data.data.length === 0) return <p className="text-muted">{t('empty')}</p>;
  return (
    <ol className="border-line flex flex-col border-l">
      {events.data.data.map((event) => (
        <li key={event.id} className="relative flex flex-col gap-0.5 pb-5 pl-5">
          <span
            aria-hidden="true"
            className="border-field-line bg-panel absolute top-1.5 -left-[5px] size-2.5 rounded-full border"
          />
          <p className="font-semibold">{t(`status.${known(event.status) ?? 'other'}`)}</p>
          <p className="text-meta text-muted tabular-nums">
            {format.dateTime(new Date(event.created_at), {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: localTimeZone(),
            })}
            {' · '}
            {t(`source.${event.source}`)}
          </p>
          {event.detail.raw_status === undefined ? null : (
            <p className="text-meta text-muted">
              {t('meta_said', { status: event.detail.raw_status })}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
