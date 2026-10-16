'use client';
// Appels de l'étape « Proposition » (APPFLOW §8.3) vers les routes `campaigns` et `proposals` (API_SPEC §14). Chaque réponse est
// validée par un schéma Zod ; la campagne et les propositions restent dans TanStack Query (LLD §7.1), jamais copiées dans un
// état local.
//
// Affichage progressif (TR-PRF-05) : la génération passe par `useMutation`, qui lit le flux `text/event-stream` avec `fetch`
// (EventSource ne sait pas envoyer POST ni `Idempotency-Key`). Ce n'est pas un `fetch` dans un `useEffect` : c'est une action de
// l'utilisateur (clic), avec sa propre annulation. Les champs reçus ne sont qu'un aperçu : seule la proposition de `done` fait foi.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, type ApiProblem } from '../../lib/api';

export const OBJECTIVES = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
  'OUTCOME_SALES',
] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const DESTINATIONS = [
  'WHATSAPP',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
  'WEBSITE',
  'APP',
  'ON_POST',
  'NONE',
] as const;
export type Destination = (typeof DESTINATIONS)[number];

/** Destinations permises par objectif (PRD §7.1) : la même table que le serveur. */
export const OBJECTIVE_DESTINATIONS: Readonly<Record<Objective, readonly Destination[]>> = {
  OUTCOME_ENGAGEMENT: ['WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'ON_POST'],
  OUTCOME_TRAFFIC: ['WEBSITE', 'APP'],
  OUTCOME_AWARENESS: ['NONE'],
  OUTCOME_SALES: ['WEBSITE'],
};

export const CTAS = [
  'SEND_WHATSAPP_MESSAGE',
  'SEND_MESSAGE',
  'LEARN_MORE',
  'SHOP_NOW',
  'ORDER_NOW',
  'CONTACT_US',
  'BOOK_NOW',
  'SIGN_UP',
  'GET_OFFER',
] as const;

const MoneySchema = z.object({
  xaf: z.number(),
  usd_cents: z.number(),
  currency: z.enum(['XAF', 'XOF']).optional(),
});
export type MoneyView = z.infer<typeof MoneySchema>;

export const CostSchema = z.object({
  status: z.enum(['ok', 'incomplete', 'vat_not_configured', 'fx_not_available']),
  vat_country: z.string().nullable().optional(),
  vat_rate: z.number().nullable().optional(),
  days: z.number().nullable().optional(),
  budget_usd_cents: z.number().nullable().optional(),
  vat_usd_cents: z.number().nullable().optional(),
  total_usd_cents: z.number().nullable().optional(),
  total: MoneySchema.nullable().optional(),
  daily: MoneySchema.nullable().optional(),
  fx: z.object({ rate: z.number() }).nullable().optional(),
});
export type Cost = z.infer<typeof CostSchema>;

const CopySchema = z.object({
  primary_text: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().nullable().optional(),
  cta: z.enum(CTAS).optional(),
  angle: z.string().optional(),
});
const GeoSchema = z.object({
  countries: z.array(z.string()).optional(),
  cities: z.array(z.object({ name: z.string(), radius_km: z.number() })).optional(),
});
const TargetingSchema = z.object({
  age_min: z.number().optional(),
  age_max: z.number().optional(),
  genders: z.enum(['all', 'male', 'female']).optional(),
  advantage_plus: z.boolean().optional(),
  interests: z
    .array(z.object({ name: z.string(), id: z.string().nullable().optional() }))
    .optional(),
});

export const CampaignSchema = z.object({
  id: z.string(),
  status: z.string(),
  version: z.number(),
  name: z.string(),
  editable: z.boolean(),
  analysis_id: z.string().nullable().optional(),
  objective: z.enum(OBJECTIVES).nullable().optional(),
  destination: z.enum(DESTINATIONS).nullable().optional(),
  geo: GeoSchema.default({}),
  targeting: TargetingSchema.default({}),
  daily_budget_usd_cents: z.number().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  copy: CopySchema.default({}),
  chosen_proposal_version: z.number().nullable().optional(),
  cost: CostSchema,
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const ProposalBodySchema = z.object({
  objective: z.enum(OBJECTIVES),
  objective_reason: z.string().default(''),
  destination: z.enum(DESTINATIONS),
  geo: z.object({
    countries: z.array(z.string()).default([]),
    cities: z.array(z.object({ name: z.string(), radius_km: z.number() })).default([]),
    reason: z.string().default(''),
  }),
  budget: z.object({ daily_usd_cents: z.number(), reason: z.string().default('') }),
  schedule: z.object({
    start_date: z.string(),
    end_date: z.string(),
    reason: z.string().default(''),
  }),
  copy: z.object({
    primary_text: z.string(),
    headline: z.string(),
    description: z.string().nullable().default(null),
    cta: z.enum(CTAS),
    angle: z.string().default(''),
  }),
  warnings: z.array(z.string()).default([]),
});
export type ProposalBody = z.infer<typeof ProposalBodySchema>;

export const ProposalSchema = z.object({
  version: z.number(),
  status: z.string(),
  chosen: z.boolean(),
  proposal: ProposalBodySchema,
  cost: CostSchema,
  created_at: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

const ProposalListSchema = z.object({ data: z.array(ProposalSchema) });

const base = (workspaceId: string): string => `/workspaces/${workspaceId}`;
export const campaignKey = (workspaceId: string, campaignId: string) =>
  ['campaign', workspaceId, campaignId] as const;
export const proposalsKey = (workspaceId: string, campaignId: string) =>
  ['proposals', workspaceId, campaignId] as const;

// ---- Campagne -------------------------------------------------------------------------------------------------------------

/** Crée le brouillon à partir de l'analyse prête (aucune dépense). */
export function useCreateDraft(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { analysisId: string; pageId: string | null }) =>
      apiFetch(`${base(workspaceId)}/campaigns`, CampaignSchema, {
        method: 'POST',
        body: {
          analysis_id: vars.analysisId,
          ...(vars.pageId === null ? {} : { page_id: vars.pageId }),
          platform: 'meta',
        },
      }),
    onSuccess: (campaign) => {
      client.setQueryData(campaignKey(workspaceId, campaign.id), campaign);
    },
  });
}

export function useCampaign(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: campaignKey(workspaceId, campaignId ?? ''),
    enabled: campaignId !== null,
    queryFn: () => apiFetch(`${base(workspaceId)}/campaigns/${campaignId ?? ''}`, CampaignSchema),
  });
}

export function useProposals(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: proposalsKey(workspaceId, campaignId ?? ''),
    enabled: campaignId !== null,
    queryFn: async () =>
      (
        await apiFetch(
          `${base(workspaceId)}/campaigns/${campaignId ?? ''}/proposals`,
          ProposalListSchema,
        )
      ).data,
  });
}

export interface CampaignPatchBody {
  version: number;
  objective?: Objective;
  destination?: Destination;
  daily_budget_usd_cents?: number;
  start_date?: string;
  end_date?: string;
  copy?: {
    primary_text?: string;
    headline?: string;
    description?: string;
    cta?: (typeof CTAS)[number];
  };
  geo?: { countries?: string[]; cities?: { name: string; radius_km: number }[] };
  targeting?: { interests?: { name: string }[] };
}

/** Modification avec `version` (EC-TEAM-08) : une version périmée donne `409 conflict` avec `meta.current_version`. */
export function useUpdateCampaign(workspaceId: string, campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CampaignPatchBody) =>
      apiFetch(`${base(workspaceId)}/campaigns/${campaignId}`, CampaignSchema, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (campaign) => {
      client.setQueryData(campaignKey(workspaceId, campaignId), campaign);
    },
  });
}

/** Retient une proposition : le serveur la copie dans le brouillon après l'avoir revalidée. */
export function useChooseProposal(workspaceId: string, campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalVersion: number; campaignVersion: number }) =>
      apiFetch(
        `${base(workspaceId)}/campaigns/${campaignId}/proposals/${String(input.proposalVersion)}/choose`,
        CampaignSchema,
        { method: 'POST', body: { version: input.campaignVersion } },
      ),
    onSuccess: async (campaign) => {
      client.setQueryData(campaignKey(workspaceId, campaignId), campaign);
      await client.invalidateQueries({ queryKey: proposalsKey(workspaceId, campaignId) });
    },
  });
}

// ---- Flux SSE -------------------------------------------------------------------------------------------------------------

export type StreamEvent =
  | { type: 'field'; path: string; value: unknown }
  | { type: 'retry' }
  | { type: 'done'; proposal: Proposal }
  | { type: 'error'; problem: ApiProblem };

const FieldEventSchema = z.object({ path: z.string(), value: z.unknown() });
const ProblemSchema = z.object({
  code: z.string(),
  status: z.number(),
  type: z.string().optional(),
  title: z.string().optional(),
  request_id: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  retry_after_s: z.number().optional(),
});

/** Lit un flux `text/event-stream` bloc par bloc ; un événement inconnu est ignoré (API_SPEC §1 : champs et événements ajoutables). */
export async function readProposalStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = (block: string): void => {
    const name = /^event: (\w+)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (name === undefined || data === undefined) return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (name === 'field') {
      const parsed = FieldEventSchema.safeParse(json);
      if (parsed.success)
        onEvent({ type: 'field', path: parsed.data.path, value: parsed.data.value });
    } else if (name === 'retry') {
      onEvent({ type: 'retry' });
    } else if (name === 'done') {
      const parsed = ProposalSchema.safeParse(json);
      if (parsed.success) onEvent({ type: 'done', proposal: parsed.data });
    } else if (name === 'error') {
      const parsed = ProblemSchema.safeParse(json);
      if (parsed.success) onEvent({ type: 'error', problem: parsed.data as ApiProblem });
    }
  };
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    let cut = buffer.indexOf('\n\n');
    while (cut !== -1) {
      dispatch(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim() !== '') dispatch(buffer);
}

export class StreamEndedError extends Error {
  constructor() {
    super('stream_ended');
    this.name = 'StreamEndedError';
  }
}

export interface GenerateVars {
  campaignId: string;
  /** Une clé par intention (un clic) : la réutiliser pour reprendre une génération coupée (API_SPEC §7). */
  key: string;
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

/**
 * Génère une proposition en flux. Une erreur avant le début du flux (400, 403, 404, 409…) est une réponse HTTP normale et
 * devient une `ApiError` ; une erreur pendant le flux arrive dans l'événement `error`, relayé à `onEvent` puis levé.
 * Un flux qui se ferme sans `done` ni `error` (réseau coupé) lève `StreamEndedError` : le client peut reprendre avec la même clé.
 */
export function useGenerateProposal(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: GenerateVars): Promise<Proposal> => {
      const response = await fetch(
        `/api/v1${base(workspaceId)}/campaigns/${vars.campaignId}/proposals`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'text/event-stream', 'idempotency-key': vars.key },
          ...(vars.signal === undefined ? {} : { signal: vars.signal }),
        },
      );
      if (!response.ok || response.body === null) {
        const payload: unknown = await response.json().catch(() => null);
        const parsed = ProblemSchema.safeParse(payload);
        throw new ApiError(response.status, parsed.success ? (parsed.data as ApiProblem) : null);
      }
      let done: Proposal | undefined;
      let problem: ApiProblem | undefined;
      await readProposalStream(response.body, (event) => {
        if (event.type === 'done') done = event.proposal;
        if (event.type === 'error') problem = event.problem;
        vars.onEvent(event);
      });
      if (problem !== undefined) throw new ApiError(problem.status, problem);
      if (done === undefined) throw new StreamEndedError();
      return done;
    },
    onSuccess: async (_proposal, vars) => {
      await client.invalidateQueries({ queryKey: proposalsKey(workspaceId, vars.campaignId) });
    },
  });
}
