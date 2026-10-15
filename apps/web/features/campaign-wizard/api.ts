'use client';
// Appels de l'assistant de campagne vers les routes « sources et analyse » (API_SPEC §14). Chaque réponse est validée par
// un schéma Zod ; l'analyse reste dans TanStack Query (LLD §7.1), jamais copiée dans un état local.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

export const ANALYSIS_STATUSES = [
  'queued',
  'reading',
  'analysing',
  'questions',
  'ready',
  'blocked',
  'failed',
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const QUESTION_INPUTS = [
  'phone',
  'text',
  'single_choice',
  'multi_choice',
  'location',
  'number',
] as const;

export const QuestionSchema = z.object({
  id: z.string(),
  field: z.string().optional(),
  text: z.string(),
  why: z.string().optional(),
  input: z.enum(QUESTION_INPUTS),
  options: z.array(z.string()).nullable().optional(),
  required: z.boolean(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const AnalysisSchema = z.object({
  id: z.string(),
  status: z.enum(ANALYSIS_STATUSES),
  blocked_reason: z.string().nullable().optional(),
  questions: z.array(QuestionSchema).default([]),
  unreadable_sources: z.array(z.number()).default([]),
  error_code: z.string().nullable().optional(),
  flags: z.array(z.string()).default([]),
  answers: z.array(z.object({ question_id: z.string(), answer: z.string() })).default([]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const TicketSchema = z.object({
  upload_url: z.url(),
  file_path: z.string(),
  expires_at: z.string(),
});

const base = (workspaceId: string): string => `/workspaces/${workspaceId}`;
export const analysisKey = (workspaceId: string, analysisId: string) =>
  ['analysis', workspaceId, analysisId] as const;

/** Envoi d'un fichier : URL signée (POST /uploads), puis envoi direct au stockage privé (API_SPEC §13). */
export class UploadFailedError extends Error {
  constructor() {
    super('upload_failed');
    this.name = 'UploadFailedError';
  }
}

export async function uploadFile(
  workspaceId: string,
  file: File,
  purpose: 'source' | 'reference' = 'source',
): Promise<string> {
  const ticket = await apiFetch(`${base(workspaceId)}/uploads`, TicketSchema, {
    method: 'POST',
    body: { purpose, mime: file.type, size: file.size },
  });
  const sent = await fetch(ticket.upload_url, {
    method: 'PUT',
    headers: { 'content-type': file.type, 'x-upsert': 'false' },
    body: file,
  });
  if (!sent.ok) throw new UploadFailedError();
  return ticket.file_path;
}

export type SourcePayload =
  | { type: 'website' | 'app_link' | 'social_post'; url: string }
  | { type: 'image' | 'document'; file_path: string }
  | { type: 'text'; text: string };

export interface StartAnalysisBody {
  page_id?: string;
  user_intent?: string;
  sources: SourcePayload[];
}

/** Lance l'analyse (202) : action qui dépense, donc `Idempotency-Key` (API_SPEC §7). */
export function useStartAnalysis(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: StartAnalysisBody; key: string }) =>
      apiFetch(`${base(workspaceId)}/analyses`, AnalysisSchema, {
        method: 'POST',
        body: vars.body,
        headers: { 'idempotency-key': vars.key },
      }),
    onSuccess: (analysis) => {
      client.setQueryData(analysisKey(workspaceId, analysis.id), analysis);
    },
  });
}

const TERMINAL: readonly AnalysisStatus[] = ['questions', 'ready', 'blocked', 'failed'];
export const isTerminal = (status: AnalysisStatus): boolean => TERMINAL.includes(status);

/** Suivi de l'analyse : toutes les 3 s, puis toutes les 10 s après 1 minute (API_SPEC §9). */
export function useAnalysis(workspaceId: string, analysisId: string | null) {
  // Instant du premier affichage : passé 1 minute, on interroge moins souvent. Ce n'est pas une donnée du serveur.
  const [startedAt] = useState(() => Date.now());
  return useQuery({
    queryKey: analysisKey(workspaceId, analysisId ?? ''),
    enabled: analysisId !== null,
    queryFn: () => apiFetch(`${base(workspaceId)}/analyses/${analysisId ?? ''}`, AnalysisSchema),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status !== undefined && isTerminal(status)) return false;
      return Date.now() - startedAt > 60_000 ? 10_000 : 3_000;
    },
  });
}

export function useAnswerQuestions(workspaceId: string, analysisId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answers: { question_id: string; answer: string }[]) =>
      apiFetch(`${base(workspaceId)}/analyses/${analysisId}/answers`, AnalysisSchema, {
        method: 'POST',
        body: { answers },
      }),
    onSuccess: (analysis) => {
      client.setQueryData(analysisKey(workspaceId, analysisId), analysis);
    },
  });
}
