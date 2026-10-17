'use client';
// Appels des étapes « Aperçu » et « Publier » (APPFLOW §8.5-8.6) vers les routes `campaigns` : état avant publication, estimation
// de portée de Meta, publication. Chaque réponse est validée par un schéma Zod ; les données du serveur restent dans TanStack
// Query (LLD §7.1), jamais copiées dans un état local.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { campaignKey, CampaignSchema, type Campaign } from './proposal-api';

const base = (workspaceId: string, campaignId: string): string =>
  `/workspaces/${workspaceId}/campaigns/${campaignId}`;

export const ReadinessSchema = z.object({
  liability_required: z.boolean(),
  visual: z.object({
    status: z.enum(['ready', 'missing', 'expired']),
    url: z.string().nullable(),
    expires_at: z.string().nullable(),
  }),
  meta: z.object({
    connection: z.enum(['ok', 'expiring', 'expired', 'revoked', 'none']),
    ad_account: z
      .object({
        name: z.string().nullable(),
        currency: z.string().nullable(),
        // La monnaie est-elle dans la liste officielle de Meta ? `null` : pas encore lue.
        currency_supported: z.boolean().nullish(),
      })
      .nullable(),
    payment_method: z.enum(['present', 'missing', 'unknown']),
  }),
  page: z.object({ id: z.string(), name: z.string().nullable(), active: z.boolean() }).nullable(),
  cities: z.array(
    z.object({ name: z.string(), radius_km: z.number(), effective_radius_km: z.number() }),
  ),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export const EstimateSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  reason: z
    .enum([
      'not_connected',
      'token_expired',
      'incomplete_campaign',
      'meta_unavailable',
      'not_ready',
    ])
    .nullable(),
  audience: z.object({ lower: z.number(), upper: z.number() }).nullable(),
  source: z.literal('meta_delivery_estimate'),
  fetched_at: z.string(),
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const readinessKey = (workspaceId: string, campaignId: string) =>
  ['readiness', workspaceId, campaignId] as const;
export const estimateKey = (workspaceId: string, campaignId: string) =>
  ['estimate', workspaceId, campaignId] as const;

/** L'adresse signée de la photo dure 15 minutes : on la relit avant son expiration. */
export function useReadiness(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: readinessKey(workspaceId, campaignId ?? ''),
    enabled: campaignId !== null,
    queryFn: () => apiFetch(`${base(workspaceId, campaignId ?? '')}/readiness`, ReadinessSchema),
    refetchInterval: 12 * 60_000,
    staleTime: 60_000,
  });
}

/** Estimation de Meta : jamais relancée en boucle (une panne de Meta ne doit pas la marteler). */
export function useReachEstimate(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: estimateKey(workspaceId, campaignId ?? ''),
    enabled: campaignId !== null,
    queryFn: () => apiFetch(`${base(workspaceId, campaignId ?? '')}/estimate`, EstimateSchema),
    retry: false,
    staleTime: 10 * 60_000,
  });
}

/** Campagne suivie pendant la publication : relue toutes les 2 s tant qu'elle est « en publication » (API_SPEC §9). */
export function usePublishedCampaign(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: campaignKey(workspaceId, campaignId ?? ''),
    enabled: campaignId !== null,
    queryFn: () => apiFetch(base(workspaceId, campaignId ?? ''), CampaignSchema),
    refetchInterval: (query) => (query.state.data?.status === 'publishing' ? 2_000 : false),
  });
}

export interface PublishVars {
  /** `Idempotency-Key` de CETTE intention : la même pour un renvoi après coupure, une nouvelle pour une nouvelle intention. */
  key: string;
  acceptLiability: boolean;
  confirmedTotal?: { amount_minor: number; currency: string };
}

/** Publier (202) : action qui engage de l'argent chez Meta et un quota, donc `Idempotency-Key` obligatoire (API_SPEC §7). */
export function usePublish(workspaceId: string, campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: PublishVars) =>
      apiFetch(`${base(workspaceId, campaignId)}/publish`, CampaignSchema, {
        method: 'POST',
        headers: { 'idempotency-key': vars.key },
        body: {
          accept_liability: vars.acceptLiability,
          ...(vars.confirmedTotal === undefined ? {} : { confirmed_total: vars.confirmedTotal }),
        },
      }),
    onSuccess: (campaign: Campaign) => {
      client.setQueryData(campaignKey(workspaceId, campaignId), campaign);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: readinessKey(workspaceId, campaignId) });
      void client.invalidateQueries({ queryKey: campaignKey(workspaceId, campaignId) });
    },
  });
}
