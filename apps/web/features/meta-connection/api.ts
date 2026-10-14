'use client';
// Appels de l'application vers les routes Meta (API_SPEC §14). Chaque réponse est validée par un
// schéma Zod ; les données du serveur restent dans TanStack Query (LLD §7.1), jamais dans un état local.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

export const HEALTH_KEYS = [
  'business_portfolio',
  'ad_account',
  'payment_method',
  'page',
  'instagram',
  'whatsapp',
  'pixel',
  'permissions',
] as const;
export type HealthKey = (typeof HEALTH_KEYS)[number];

const HealthItemSchema = z.object({
  key: z.enum(HEALTH_KEYS),
  ok: z.boolean(),
  required: z.boolean().optional(),
  recommended: z.boolean().optional(),
  guide_slug: z.string().optional(),
});
export const HealthSchema = z.object({
  checked_at: z.string(),
  items: z.array(HealthItemSchema),
});
export type Health = z.infer<typeof HealthSchema>;
export type HealthItem = z.infer<typeof HealthItemSchema>;

export const ConnectionSchema = z.object({
  id: z.string(),
  token_type: z.enum(['system_user', 'user']),
  status: z.enum(['ok', 'expiring', 'expired', 'revoked']),
  expires_at: z.string().nullable(),
  business_id: z.string().nullable().optional(),
  last_health_check: HealthSchema.nullable().optional(),
});
export type MetaConnection = z.infer<typeof ConnectionSchema>;

export const AdAccountSchema = z.object({
  id: z.string(),
  meta_ad_account_id: z.string(),
  name: z.string().optional(),
  currency: z.string().optional(),
  has_payment_method: z.boolean().nullable().optional(),
  is_active: z.boolean(),
});
export type AdAccount = z.infer<typeof AdAccountSchema>;

const base = (workspaceId: string): string => `/workspaces/${workspaceId}`;
const keys = {
  connections: (ws: string) => ['meta', 'connections', ws] as const,
  adAccounts: (ws: string) => ['meta', 'ad-accounts', ws] as const,
};

export function useConnections(workspaceId: string) {
  return useQuery({
    queryKey: keys.connections(workspaceId),
    queryFn: async () =>
      (
        await apiFetch(
          `${base(workspaceId)}/meta/connections`,
          z.object({ data: z.array(ConnectionSchema) }),
        )
      ).data,
  });
}

export function useAdAccounts(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.adAccounts(workspaceId),
    enabled,
    queryFn: async () =>
      (
        await apiFetch(
          `${base(workspaceId)}/ad-accounts`,
          z.object({ data: z.array(AdAccountSchema) }),
        )
      ).data,
  });
}

/** Tout ce que la connexion fait changer : connexions et comptes. */
function useInvalidateMeta(workspaceId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.connections(workspaceId) }),
      client.invalidateQueries({ queryKey: keys.adAccounts(workspaceId) }),
    ]);
}

/** Démarre la connexion : l'appelant envoie le navigateur vers l'adresse de Facebook. */
export function useStartConnect(workspaceId: string) {
  return useMutation({
    mutationFn: (returnTo: 'onboarding' | 'settings') =>
      apiFetch(`${base(workspaceId)}/meta/connect`, z.object({ authorize_url: z.url() }), {
        method: 'POST',
        body: { return_to: returnTo },
      }),
  });
}

export function useDisconnect(workspaceId: string) {
  const invalidate = useInvalidateMeta(workspaceId);
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`${base(workspaceId)}/meta/connections/${connectionId}`, z.undefined(), {
        method: 'DELETE',
      }),
    onSettled: invalidate,
  });
}

export function useHealthCheck(workspaceId: string) {
  const invalidate = useInvalidateMeta(workspaceId);
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`${base(workspaceId)}/meta/connections/${connectionId}/health-check`, HealthSchema, {
        method: 'POST',
      }),
    onSettled: invalidate,
  });
}

export function useActivateAdAccount(workspaceId: string) {
  const invalidate = useInvalidateMeta(workspaceId);
  return useMutation({
    mutationFn: (adAccountId: string) =>
      apiFetch(`${base(workspaceId)}/ad-accounts/${adAccountId}/activate`, AdAccountSchema, {
        method: 'POST',
      }),
    onSettled: invalidate,
  });
}
