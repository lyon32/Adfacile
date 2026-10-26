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
  more: z.boolean(),
});
export type PauseAllResult = z.infer<typeof PauseAllSchema>;

export const ResumeAllSchema = z.object({
  resumed: z.number(),
  failed: z.array(FailureSchema),
  remaining: z.number(),
  rate_limited: z.boolean(),
  more: z.boolean(),
});
export type ResumeAllResult = z.infer<typeof ResumeAllSchema>;

const MoneySchema = z.object({
  usd_cents: z.number(),
  local_minor: z.number().nullable(),
  currency: z.string().nullable(),
});

const BillingPausedSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      daily_budget_usd_cents: z.number().nullable().optional(),
      // Budget par jour converti PAR LE SERVEUR avec le taux réel (`exchange_rates`, moins de 48 h) ; `null` sinon : dollars seuls.
      cost: z.looseObject({ daily: MoneySchema.nullable().optional() }).optional(),
    }),
  ),
  next_cursor: z.string().nullable().optional(),
});

/** Les campagnes mises en pause par le verrouillage (au plus 100 lues) et leur budget quotidien total. */
export interface BillingPaused {
  count: number;
  /** Plus de 100 campagnes : le nombre et le montant sont des MINIMUMS (« au moins »). */
  atLeast: boolean;
  dailyBudgetUsdCents: number;
  /** Total par jour en monnaie locale, SEULEMENT si toutes les campagnes ont un taux réel et la même monnaie ; sinon `null`. */
  dailyLocalMinor: number | null;
  currency: string | null;
}

/** Cumule les budgets quotidiens : monnaie locale seulement si TOUS ont un montant converti dans la même monnaie. */
export function sumBudgets(
  rows: { usd: number; local: { minor: number; currency: string } | null }[],
): Pick<BillingPaused, 'dailyBudgetUsdCents' | 'dailyLocalMinor' | 'currency'> {
  const usd = rows.reduce((sum, r) => sum + r.usd, 0);
  const first = rows[0]?.local ?? null;
  const same =
    first !== null && rows.every((r) => r.local !== null && r.local.currency === first.currency);
  return {
    dailyBudgetUsdCents: usd,
    dailyLocalMinor: same ? rows.reduce((sum, r) => sum + (r.local?.minor ?? 0), 0) : null,
    currency: same ? first.currency : null,
  };
}

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
      const rows = page.data.map((c) => {
        const daily = c.cost?.daily ?? null;
        return {
          usd: c.daily_budget_usd_cents ?? 0,
          local:
            daily?.local_minor !== null &&
            daily?.local_minor !== undefined &&
            daily.currency !== null
              ? { minor: daily.local_minor, currency: daily.currency }
              : null,
        };
      });
      const result: BillingPaused = {
        count: page.data.length,
        atLeast: page.next_cursor !== null && page.next_cursor !== undefined,
        ...sumBudgets(rows),
      };
      return result;
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
