'use client';
// Appels de la vie de la campagne (S17, APPFLOW §7 et §11) : tableau de bord, page de campagne (Résultats, Pubs, Historique),
// « Actualiser », pause, reprise, relance. Chaque réponse est validée par un schéma Zod ; les données du serveur restent dans TanStack
// Query (LLD §7.1), jamais copiées dans un état local.
//
// MISE À JOUR SANS RECHARGEMENT : les requêtes se rafraîchissent d'elles-mêmes (interrogation régulière, API_SPEC §9 « secours »)
// et dès qu'un onglet redevient visible. Les tables `campaigns`, `stats_daily` et `campaign_status_events` sont publiées dans
// Supabase Realtime (migration 0015) ; le branchement du navigateur attend une décision sur l'authentification de Realtime
// (la session est dans des cookies HttpOnly que le navigateur ne lit pas), voir le rapport de S17.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { CampaignSchema, campaignKey, type Campaign } from '../campaign-wizard/proposal-api';

export const STATUSES = [
  'draft',
  'publishing',
  'in_review',
  'active',
  'paused',
  'rejected',
  'ended',
  'stopped',
  'error',
] as const;
export type CampaignStatus = (typeof STATUSES)[number];

export const RESULT_KINDS = [
  'whatsapp_conversation',
  'messenger_conversation',
  'instagram_conversation',
  'conversation',
  'purchase',
  'lead',
  'link_click',
  'post_engagement',
] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

const MoneySchema = z.object({
  usd_cents: z.number(),
  local_minor: z.number().nullable(),
  currency: z.string().nullable(),
});
export type StatsMoney = z.infer<typeof MoneySchema>;

const FxSchema = z.object({
  status: z.enum(['ok', 'fx_not_available']),
  currency: z.string().nullable(),
  source: z.string().nullable(),
  fetched_at: z.string().nullable(),
});
export type StatsFx = z.infer<typeof FxSchema>;

const SyncErrorSchema = z.enum(['rate_limited', 'fx_not_available', 'meta_error', 'token_expired']);
export type SyncError = z.infer<typeof SyncErrorSchema>;

export const OverviewSchema = z.object({
  counts: z.object({
    active: z.number(),
    in_review: z.number(),
    paused: z.number(),
    stopped: z.number(),
    other: z.number(),
  }),
  month: z.string(),
  spent_month: MoneySchema,
  range: z.enum(['week', 'month']),
  chart: z.array(z.object({ date: z.string(), results: z.number(), spend_usd_cents: z.number() })),
  campaigns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(STATUSES),
      paused_at: z.string().nullable(),
      results: z.number(),
      result_kind: z.enum(RESULT_KINDS).nullable(),
      spend: MoneySchema,
      cost_per_result: MoneySchema.nullable(),
      synced_at: z.string().nullable(),
      sync_error: SyncErrorSchema.nullable(),
    }),
  ),
  fx: FxSchema,
});
export type Overview = z.infer<typeof OverviewSchema>;

export const StatsSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  summary: z.object({
    spend: MoneySchema,
    results: z.number(),
    result_kind: z.enum(RESULT_KINDS).nullable(),
    cost_per_result: MoneySchema.nullable(),
    reach: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number().nullable(),
    cpm: MoneySchema.nullable(),
    frequency: z.number().nullable(),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      spend: MoneySchema,
      results: z.number(),
      impressions: z.number(),
      reach: z.number(),
      clicks: z.number(),
    }),
  ),
  fx: FxSchema,
  synced_at: z.string().nullable(),
  sync_error: SyncErrorSchema.nullable(),
});
export type CampaignStats = z.infer<typeof StatsSchema>;

export const EventsSchema = z.object({
  data: z.array(
    z.object({
      id: z.number(),
      created_at: z.string(),
      status: z.string(),
      source: z.enum(['webhook', 'poll', 'user']),
      detail: z.object({
        raw_status: z.string().optional(),
        event: z.string().optional(),
        reason: z.string().optional(),
        from: z.string().optional(),
      }),
    }),
  ),
});
export type CampaignEvents = z.infer<typeof EventsSchema>;

export const AdsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      format: z.string().nullable(),
      variant: z.enum(['A', 'B']).nullable(),
      status: z.string().nullable(),
      photo_url: z.string().nullable(),
    }),
  ),
  ab_test: z.boolean(),
});
export type CampaignAds = z.infer<typeof AdsSchema>;

const RefreshSchema = z.object({ status: z.literal('queued'), requested_at: z.string() });

/** Délais d'interrogation (API_SPEC §9 : 3 s puis 10 s) pour les attentes courtes ; 30 s pour une page affichée en continu. */
export const POLL_IDLE_MS = 30_000;
export const POLL_WAITING_FAST_MS = 3_000;
export const POLL_WAITING_SLOW_MS = 10_000;

/** Délai maximum d'attente d'une actualisation demandée : au-delà, l'écran reprend la main (la copie a pu échouer sans le dire). */
export const REFRESH_WAIT_MAX_MS = 120_000;

/**
 * Attend-on encore la copie demandée par « Actualiser » ? Non quand elle est arrivée (`synced_at` à l'instant demandé ou après), quand
 * elle a échoué (`sync_error` : `synced_at` n'avance alors jamais), ou après `REFRESH_WAIT_MAX_MS`. Les dates sont comparées comme des
 * INSTANTS (`Date.parse`), pas comme du texte.
 */
export function isRefreshPending(
  requestedAt: string | null,
  stats: RefreshStats | undefined,
  nowMs: number,
): boolean {
  if (requestedAt === null) return false;
  const requested = Date.parse(requestedAt);
  if (Number.isNaN(requested)) return false;
  if (nowMs - requested >= REFRESH_WAIT_MAX_MS) return false;
  return isAwaitingCopy(requestedAt, stats);
}

export interface RefreshStats {
  synced_at: string | null;
  sync_error: string | null;
}

/** Sans horloge : la copie demandée n'est ni arrivée ni en échec. Le délai maximum est géré à part (minuterie de l'écran). */
export function isAwaitingCopy(
  requestedAt: string | null,
  stats: RefreshStats | undefined,
): boolean {
  if (requestedAt === null) return false;
  const requested = Date.parse(requestedAt);
  if (Number.isNaN(requested)) return false;
  if (stats !== undefined && stats.sync_error !== null) return false;
  const synced = stats?.synced_at ?? null;
  return synced === null || Date.parse(synced) < requested;
}

export const qk = {
  overview: (ws: string, range: string) => ['ws', ws, 'overview', range] as const,
  overviewAll: (ws: string) => ['ws', ws, 'overview'] as const,
  stats: (ws: string, id: string) => ['ws', ws, 'campaign', id, 'stats'] as const,
  events: (ws: string, id: string) => ['ws', ws, 'campaign', id, 'events'] as const,
  ads: (ws: string, id: string) => ['ws', ws, 'campaign', id, 'ads'] as const,
};

const base = (ws: string, id: string): string => `/workspaces/${ws}/campaigns/${id}`;

export function useOverview(ws: string | null, range: 'week' | 'month') {
  return useQuery({
    queryKey: qk.overview(ws ?? '', range),
    enabled: ws !== null,
    queryFn: ({ signal }) =>
      apiFetch(`/workspaces/${ws ?? ''}/overview?range=${range}`, OverviewSchema, { signal }),
    staleTime: 60_000,
    // Changer de période garde l'écran tel quel pendant le chargement (jamais un écran vide).
    placeholderData: keepPreviousData,
    refetchInterval: POLL_IDLE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCampaignDetail(ws: string, id: string) {
  return useQuery({
    queryKey: campaignKey(ws, id),
    queryFn: ({ signal }) => apiFetch(base(ws, id), CampaignSchema, { signal }),
    staleTime: 10_000,
    // Une publication (ou republication) en cours : on regarde de près jusqu'à ce que Meta ait reçu la campagne ou que ça échoue.
    refetchInterval: (query) =>
      query.state.data?.status === 'publishing' ? POLL_WAITING_FAST_MS : POLL_IDLE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCampaignStats(ws: string, id: string, requestedAt: string | null) {
  return useQuery({
    queryKey: qk.stats(ws, id),
    queryFn: ({ signal }) => apiFetch(`${base(ws, id)}/stats`, StatsSchema, { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    // Une actualisation vient d'être demandée et la copie n'est pas encore arrivée : on regarde de près (3 s) ; sinon un rythme calme.
    refetchInterval: (query) =>
      isRefreshPending(requestedAt, query.state.data, Date.now())
        ? POLL_WAITING_FAST_MS
        : POLL_IDLE_MS,
  });
}

export function useCampaignEvents(ws: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.events(ws, id),
    enabled,
    queryFn: ({ signal }) => apiFetch(`${base(ws, id)}/events`, EventsSchema, { signal }),
    staleTime: 10_000,
    refetchInterval: POLL_IDLE_MS,
  });
}

export function useCampaignAds(ws: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.ads(ws, id),
    enabled,
    // L'adresse signée de la photo vaut 15 minutes : on la renouvelle avant son expiration.
    queryFn: ({ signal }) => apiFetch(`${base(ws, id)}/ads`, AdsSchema, { signal }),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

function useInvalidateCampaign(ws: string, id: string) {
  const client = useQueryClient();
  return async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: campaignKey(ws, id) }),
      client.invalidateQueries({ queryKey: qk.stats(ws, id) }),
      client.invalidateQueries({ queryKey: qk.events(ws, id) }),
      client.invalidateQueries({ queryKey: qk.overviewAll(ws) }),
    ]);
  };
}

/** « Actualiser » : lance la copie (au plus une fois toutes les 5 minutes) ; la page suit ensuite toute seule. */
export function useRefreshStats(ws: string, id: string) {
  const invalidate = useInvalidateCampaign(ws, id);
  return useMutation({
    mutationFn: () => apiFetch(`${base(ws, id)}/stats/refresh`, RefreshSchema, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export type ControlAction = 'pause' | 'resume' | 'recover' | 'copy';

/** Pause, reprise, relance : Meta est appelé d'abord côté serveur, l'écran n'invente jamais le résultat (EC-META-07). */
export function useControlCampaign(ws: string, id: string) {
  const invalidate = useInvalidateCampaign(ws, id);
  return useMutation({
    mutationFn: async (input: { action: ControlAction; version: number }): Promise<Campaign> => {
      if (input.action === 'pause' || input.action === 'resume') {
        return apiFetch(`${base(ws, id)}/${input.action}`, CampaignSchema, { method: 'POST' });
      }
      return apiFetch(`${base(ws, id)}/relaunch`, CampaignSchema, {
        method: 'POST',
        body:
          input.action === 'recover'
            ? { mode: 'recover', version: input.version }
            : { mode: 'copy', visual_mode: 'same' },
      });
    },
    onSuccess: invalidate,
  });
}
