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

export const PageSchema = z.object({
  id: z.string(),
  meta_page_id: z.string(),
  name: z.string(),
  active: z.boolean(),
  locked_for_period: z.boolean().optional(),
  instagram_linked: z.boolean().optional(),
  whatsapp_linked: z.boolean().optional(),
  ad_language: z.enum(['fr', 'en']).optional(),
  ad_address: z.enum(['vous', 'tu']).optional(),
});
export type MetaPage = z.infer<typeof PageSchema>;

const PagesSchema = z.object({
  data: z.array(PageSchema),
  quotas: z.object({ pages_active: z.number(), pages_limit: z.number() }),
});

export const BRAND_TONES = ['premium', 'friendly', 'bold', 'serious', 'playful'] as const;
export const BrandKitSchema = z.object({
  logo_path: z.string().nullable().optional(),
  colors: z
    .object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
    })
    .optional(),
  font: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  tone: z.enum(BRAND_TONES).nullable().optional(),
  show_number_on_visuals: z.boolean().optional(),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;

const base = (workspaceId: string): string => `/workspaces/${workspaceId}`;
const keys = {
  connections: (ws: string) => ['meta', 'connections', ws] as const,
  adAccounts: (ws: string) => ['meta', 'ad-accounts', ws] as const,
  pages: (ws: string) => ['meta', 'pages', ws] as const,
  brandKit: (ws: string, pageId: string) => ['meta', 'brand-kit', ws, pageId] as const,
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

export function usePages(workspaceId: string) {
  return useQuery({
    queryKey: keys.pages(workspaceId),
    queryFn: () => apiFetch(`${base(workspaceId)}/pages`, PagesSchema),
  });
}

export function useBrandKit(workspaceId: string, pageId: string | null) {
  return useQuery({
    queryKey: keys.brandKit(workspaceId, pageId ?? ''),
    enabled: pageId !== null,
    queryFn: () => apiFetch(`${base(workspaceId)}/pages/${pageId ?? ''}/brand-kit`, BrandKitSchema),
  });
}

/** Tout ce que la connexion fait changer : connexions, comptes, Pages. */
function useInvalidateMeta(workspaceId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.connections(workspaceId) }),
      client.invalidateQueries({ queryKey: keys.adAccounts(workspaceId) }),
      client.invalidateQueries({ queryKey: keys.pages(workspaceId) }),
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

export interface PagePatch {
  active?: boolean;
  ad_language?: 'fr' | 'en';
  ad_address?: 'vous' | 'tu';
}

export function useUpdatePage(workspaceId: string) {
  const invalidate = useInvalidateMeta(workspaceId);
  return useMutation({
    mutationFn: (v: { pageId: string; patch: PagePatch }) =>
      apiFetch(`${base(workspaceId)}/pages/${v.pageId}`, PageSchema, {
        method: 'PATCH',
        body: v.patch,
      }),
    onSettled: invalidate,
  });
}

export function usePutBrandKit(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { pageId: string; kit: BrandKit }) =>
      apiFetch(`${base(workspaceId)}/pages/${v.pageId}/brand-kit`, BrandKitSchema, {
        method: 'PUT',
        body: v.kit,
      }),
    onSuccess: (kit, v) => {
      client.setQueryData(keys.brandKit(workspaceId, v.pageId), kit);
    },
  });
}
