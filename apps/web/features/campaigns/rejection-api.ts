'use client';
// Appels du refus de Meta (S18, APPFLOW §12) : lire les refus d'une campagne et leur rapport, appliquer la correction et republier.
// Chaque réponse est validée par un schéma Zod ; les données du serveur restent dans TanStack Query (LLD §7.1). Tant qu'un rapport
// est en cours de rédaction, l'écran regarde de près (4 s) : il se met à jour sans recharger.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch } from '../../lib/api';
import { CampaignSchema, campaignKey, type Campaign } from '../campaign-wizard/proposal-api';
import { POLL_IDLE_MS, qk } from './api';

export const CULPRIT_PLACES = [
  'primary_text',
  'headline',
  'description',
  'visual',
  'landing_page',
  'product',
  'unknown',
] as const;
export type CulpritPlace = (typeof CULPRIT_PLACES)[number];

/** Champs de texte qu'une correction remplace d'un clic (les mêmes que côté serveur). */
export const COPY_FIELDS = ['primary_text', 'headline', 'description'] as const;
export type CopyField = (typeof COPY_FIELDS)[number];

export function asCopyField(value: string): CopyField | null {
  return COPY_FIELDS.find((field) => field === value) ?? null;
}

const ReportSchema = z.object({
  rejection_category: z.string(),
  culprit: z.object({ where: z.enum(CULPRIT_PLACES), excerpt: z.string().nullable() }),
  cause_certainty: z.enum(['high', 'medium', 'low']),
  can_fix: z.boolean(),
  fix: z
    .object({ field: z.string(), original: z.string().nullable(), suggested: z.string() })
    .nullable(),
  appeal_recommended: z.boolean(),
  report: z.string(),
});
export type RejectionReport = z.infer<typeof ReportSchema>;

export const RejectionSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  ad_id: z.string().nullable(),
  variant: z.enum(['A', 'B']).nullable(),
  status: z.enum(['pending', 'running', 'ready', 'failed']),
  partial: z.boolean(),
  fixed: z.boolean(),
  meta_reason: z.string().nullable(),
  report: ReportSchema.nullable(),
  can_fix: z.boolean(),
  fix_applicable: z.boolean(),
  appeal_recommended: z.boolean(),
  created_at: z.string(),
});
export type Rejection = z.infer<typeof RejectionSchema>;

const RejectionListSchema = z.object({ data: z.array(RejectionSchema) });

export const rejectionKeys = {
  list: (ws: string, id: string) => ['ws', ws, 'campaign', id, 'rejections'] as const,
  one: (ws: string, id: string, rid: string) =>
    ['ws', ws, 'campaign', id, 'rejections', rid] as const,
};

const base = (ws: string, id: string): string => `/workspaces/${ws}/campaigns/${id}/rejections`;

const POLL_REPORT_MS = 4_000;
/** Un rapport toujours attendu après 2 minutes : on regarde moins souvent (le serveur le passe à « échec » après 10 minutes). */
const POLL_REPORT_SLOW_MS = 15_000;
const SLOW_AFTER_MS = 2 * 60_000;

function reportPollMs(createdAt: string): number {
  return Date.now() - Date.parse(createdAt) > SLOW_AFTER_MS ? POLL_REPORT_SLOW_MS : POLL_REPORT_MS;
}
const waiting = (rejection: Rejection): boolean =>
  rejection.status === 'pending' || rejection.status === 'running';

export function useRejections(ws: string, campaignId: string, enabled: boolean) {
  return useQuery({
    queryKey: rejectionKeys.list(ws, campaignId),
    enabled,
    queryFn: ({ signal }) => apiFetch(base(ws, campaignId), RejectionListSchema, { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const pending = query.state.data?.data.find(waiting);
      return pending === undefined ? POLL_IDLE_MS : reportPollMs(pending.created_at);
    },
  });
}

export function useRejection(ws: string, campaignId: string, rejectionId: string) {
  return useQuery({
    queryKey: rejectionKeys.one(ws, campaignId, rejectionId),
    queryFn: ({ signal }) =>
      apiFetch(`${base(ws, campaignId)}/${rejectionId}`, RejectionSchema, { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data !== undefined && waiting(query.state.data)
        ? reportPollMs(query.state.data.created_at)
        : POLL_IDLE_MS,
  });
}

/**
 * « Appliquer la correction et republier » (202) : écriture chez Meta, donc `Idempotency-Key` obligatoire (API_SPEC §7). La clé
 * est celle de CETTE intention : le même envoi rejoué (coupure réseau) ne republie pas deux fois.
 */
export function useApplyFix(ws: string, campaignId: string, rejectionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { key: string }): Promise<Campaign> =>
      apiFetch(`${base(ws, campaignId)}/${rejectionId}/apply-fix`, CampaignSchema, {
        method: 'POST',
        headers: { 'idempotency-key': vars.key },
      }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: campaignKey(ws, campaignId) }),
        client.invalidateQueries({ queryKey: rejectionKeys.list(ws, campaignId) }),
        client.invalidateQueries({ queryKey: qk.events(ws, campaignId) }),
        client.invalidateQueries({ queryKey: qk.overviewAll(ws) }),
      ]);
    },
  });
}

export type FixFailureKind =
  | 'publish_disabled'
  | 'fix_not_applicable'
  | 'partial_rejection'
  | 'already_fixed'
  | 'not_explained'
  | 'no_longer_rejected'
  | 'validation'
  | 'read_only'
  | 'other';

/** Pourquoi la republication n'a pas abouti : le code et la raison du serveur décident du message (jamais le texte brut). */
export function fixFailureOf(error: unknown): FixFailureKind {
  if (!(error instanceof ApiError)) return 'other';
  const reason = error.problem?.meta?.reason;
  switch (error.code) {
    case 'provider_unavailable':
      return reason === 'publish_disabled' ? 'publish_disabled' : 'other';
    case 'workspace_read_only':
    case 'workspace_suspended':
    case 'workspace_locked':
      return 'read_only';
    case 'validation_failed':
    case 'budget_too_low':
      return 'validation';
    case 'conflict':
      if (reason === 'partial_rejection') return 'partial_rejection';
      if (reason === 'already_fixed') return 'already_fixed';
      if (reason === 'rejection_not_explained') return 'not_explained';
      if (reason === 'no_longer_rejected') return 'no_longer_rejected';
      return reason === 'fix_not_applicable' ? 'fix_not_applicable' : 'other';
    default:
      return 'other';
  }
}
