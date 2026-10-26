'use client';
// Appels de la pause automatique et de la reprise manuelle (S19b, TR-PAY-07, EC-PAY-11). Réponses validées par Zod ; les données du
// serveur restent dans TanStack Query (LLD §7.1). Une `Idempotency-Key` neuve par CLIC (jamais par rendu).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

const FailureSchema = z.object({ campaign_id: z.string(), name: z.string(), code: z.string() });

export const PauseAllSchema = z.object({
  paused: z.number(),
  failed: z.array(FailureSchema),
  rate_limited: z.boolean(),
});
export type PauseAllResult = z.infer<typeof PauseAllSchema>;

export const ResumeAllSchema = z.object({
  resumed: z.number(),
  failed: z.array(FailureSchema),
  remaining: z.number(),
  rate_limited: z.boolean(),
});
export type ResumeAllResult = z.infer<typeof ResumeAllSchema>;

const BillingPausedSchema = z.object({
  data: z.array(
    z.looseObject({ id: z.string(), daily_budget_usd_cents: z.number().nullable().optional() }),
  ),
});

export const billingPausedKey = (ws: string) => ['ws', ws, 'billing-paused'] as const;

/** « Mettre toutes mes publicités en pause » : permis verrouillé. Meta d'abord côté serveur, l'écran n'invente rien (EC-META-07). */
export function usePauseAll(ws: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch(`/workspaces/${ws}/campaigns/pause-all`, PauseAllSchema, {
        method: 'POST',
        body: {},
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
  });
}

/** Les campagnes mises en pause par le verrouillage (au plus 100) : leur nombre et leur budget quotidien total. */
export function useBillingPaused(ws: string, enabled: boolean) {
  return useQuery({
    queryKey: billingPausedKey(ws),
    enabled,
    queryFn: async ({ signal }) => {
      const page = await apiFetch(
        `/workspaces/${ws}/campaigns?status=paused&pause_reason=billing_lock&limit=100`,
        BillingPausedSchema,
        { signal },
      );
      return {
        count: page.data.length,
        dailyBudgetUsdCents: page.data.reduce((sum, c) => sum + (c.daily_budget_usd_cents ?? 0), 0),
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** « Reprendre mes pubs » : reprend UNIQUEMENT celles du verrouillage ; dépense chez Meta, donc confirmation avant. */
export function useResumeAll(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/workspaces/${ws}/campaigns/resume-all`, ResumeAllSchema, {
        method: 'POST',
        body: {},
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: billingPausedKey(ws) }),
        client.invalidateQueries({ queryKey: ['ws', ws] }),
        client.invalidateQueries({ queryKey: ['campaign', ws] }),
      ]);
    },
  });
}
