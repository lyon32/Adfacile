import { cn } from '../lib/cn';

/** Statuts de campagne affichés (DS §5, pastille d'état). */
export const CAMPAIGN_STATUSES = [
  'active',
  'in_review',
  'rejected',
  'paused',
  'draft',
  'completed',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

type Tone = 'success' | 'warn' | 'error' | 'neutral';

const TONE: Record<CampaignStatus, Tone> = {
  active: 'success',
  in_review: 'warn',
  rejected: 'error',
  paused: 'neutral',
  draft: 'neutral',
  completed: 'neutral',
};

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  warn: 'bg-warn',
  error: 'bg-error',
  neutral: 'border border-muted bg-transparent',
};

export function statusTone(status: CampaignStatus): Tone {
  return TONE[status];
}

export interface StatusBadgeProps {
  status: CampaignStatus;
  /** Mot affiché, traduit par l'appelant : jamais la couleur seule (TR-ACC-03). */
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tone = TONE[status];
  return (
    <span
      data-status={status}
      className={cn(
        'rounded-pill border-line bg-panel text-meta text-ink inline-flex items-center gap-2 border px-3 py-1 font-semibold',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('rounded-pill size-2 shrink-0', DOT[tone])} />
      {label}
    </span>
  );
}
