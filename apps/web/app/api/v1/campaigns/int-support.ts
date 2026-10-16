// Aide des tests d'intégration « campagnes » : Page, analyse prête, TVA et change de TEST, appels de route.
// Les taux écrits ici sont des valeurs de test dans la base locale ; le produit n'en contient aucun.
import { randomUUID } from 'node:crypto';
import { testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { expect } from 'vitest';
import { call, json, ws } from '../meta/int-support';
import { POST as createRoute } from '../workspaces/[workspaceId]/campaigns/route';
import {
  GET as getRoute,
  PATCH as patchRoute,
} from '../workspaces/[workspaceId]/campaigns/[campaignId]/route';

export { call, json, ws };

export const campaignParams = (workspaceId: string, campaignId: string) => ({
  params: Promise.resolve({ workspaceId, campaignId }),
});

type Who = SeededWorkspace['owner'];

/** Taux de TVA d'ESSAI pour un pays (valeur de test, idempotent). */
export async function ensureTestVat(country: string, rate: number): Promise<void> {
  const r = await testServiceClient()
    .from('vat_rates')
    .upsert({ country_code: country, rate, valid_from: '2020-01-01' });
  expect(r.error).toBeNull();
}

/** Au moins un taux de change existe (valeur de test, ancienne : les autres tests posent des taux plus récents). */
export async function ensureTestFx(): Promise<void> {
  const svc = testServiceClient();
  const have = await svc.from('exchange_rates').select('id').eq('quote', 'XAF').limit(1);
  if ((have.data ?? []).length > 0) return;
  const r = await svc.from('exchange_rates').insert({
    base: 'USD',
    quote: 'XAF',
    rate: 600,
    source: 'manual',
    fetched_at: '2026-01-02T00:00:00Z',
  });
  expect(r.error).toBeNull();
}

export async function setOwnerCountry(s: SeededWorkspace, country: string | null): Promise<void> {
  const r = await testServiceClient()
    .from('profiles')
    .update({ country_code: country })
    .eq('id', s.owner.id);
  expect(r.error).toBeNull();
}

/** Page active de l'espace, avec un pixel connu. */
export async function seedPage(s: SeededWorkspace, pixel = '123456789012'): Promise<string> {
  const r = await testServiceClient()
    .from('pages')
    .insert({
      workspace_id: s.workspace.id,
      meta_page_id: String(Math.floor(1e11 + Math.random() * 9e11)),
      name: 'Boutique Test',
      active: true,
      pixel_ids: [pixel],
    })
    .select('id')
    .single();
  expect(r.error).toBeNull();
  return r.data?.id ?? '';
}

/** Analyse terminée (questions répondues), créée en base sans passer par l'IA. */
export async function seedReadyAnalysis(
  s: SeededWorkspace,
  pageId: string,
  status: 'ready' | 'questions' = 'ready',
): Promise<string> {
  const svc = testServiceClient();
  const profile = await svc
    .from('business_profiles')
    .insert({
      workspace_id: s.workspace.id,
      page_id: pageId,
      profile: {
        business_name: { value: 'Chez Awa', source: 0 },
        sector: { value: 'fashion_shoes', confidence: 0.9 },
      },
      conflicts: [],
      sensitive_signals: [],
      flags: [],
      questions: [],
      answers: [],
    })
    .select('id')
    .single();
  expect(profile.error).toBeNull();
  const analysis = await svc
    .from('analyses')
    .insert({
      workspace_id: s.workspace.id,
      page_id: pageId,
      created_by: s.owner.id,
      status,
      business_profile_id: profile.data?.id ?? null,
    })
    .select('id')
    .single();
  expect(analysis.error).toBeNull();
  return analysis.data?.id ?? '';
}

export function create(s: SeededWorkspace, who: Who, body: unknown): Promise<Response> {
  const id = s.workspace.id;
  return createRoute(call('POST', `/workspaces/${id}/campaigns`, who.headers, body), ws(id));
}

export function read(s: SeededWorkspace, who: Who, campaignId: string): Promise<Response> {
  const id = s.workspace.id;
  return getRoute(
    call('GET', `/workspaces/${id}/campaigns/${campaignId}`, who.headers),
    campaignParams(id, campaignId),
  );
}

export function patch(
  s: SeededWorkspace,
  who: Who,
  campaignId: string,
  body: unknown,
): Promise<Response> {
  const id = s.workspace.id;
  return patchRoute(
    call('PATCH', `/workspaces/${id}/campaigns/${campaignId}`, who.headers, body),
    campaignParams(id, campaignId),
  );
}

export interface CampaignBody {
  id: string;
  status: string;
  version: number;
  name: string;
  editable: boolean;
  analysis_id: string | null;
  page_id: string | null;
  objective: string | null;
  destination: string | null;
  daily_budget_usd_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  vat_rate: number | null;
  copy: Record<string, unknown>;
  targeting: Record<string, unknown>;
  geo: Record<string, unknown>;
  tracking: { pixel_id: string } | null;
  cost: {
    status: string;
    vat_country: string | null;
    vat_rate: number | null;
    days: number | null;
    budget_usd_cents: number | null;
    vat_usd_cents: number | null;
    total_usd_cents: number | null;
    total: { xaf: number; usd_cents: number; currency: string } | null;
    daily: { xaf: number; usd_cents: number } | null;
  };
}

/** Brouillon créé par la route, prêt à être modifié. */
export async function newDraft(s: SeededWorkspace): Promise<CampaignBody> {
  const pageId = await seedPage(s);
  const analysisId = await seedReadyAnalysis(s, pageId);
  const res = await create(s, s.owner, { analysis_id: analysisId, page_id: pageId, platform: 'meta' });
  expect(res.status).toBe(201);
  return (await json(res)) as unknown as CampaignBody;
}

/** Date AAAA-MM-JJ dans `days` jours (UTC), pour des dates toujours dans le futur. */
export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const newKey = (): string => randomUUID();
