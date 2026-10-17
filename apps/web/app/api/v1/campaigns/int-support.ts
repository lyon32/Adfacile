// Aide des tests d'intégration « campagnes » : Page, analyse prête et change de TEST, appels de route.
// Les taux écrits ici sont des valeurs de test dans la base locale ; le produit n'en contient aucun.
import { randomUUID } from 'node:crypto';
import { queryTestDb, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
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

/**
 * Un taux de change FRAIS existe pour la monnaie (valeur d'ESSAI écrite « à la main » à l'instant : un taux de plus de
 * 48 h n'est plus utilisé). Le taux d'essai par défaut du FCFA est 600 ; ce n'est pas une donnée du produit.
 */
export async function ensureTestFx(quote = 'XAF', rate = 600): Promise<void> {
  const svc = testServiceClient();
  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const have = await svc
    .from('exchange_rates')
    .select('id')
    .eq('quote', quote)
    .gte('fetched_at', since)
    .limit(1);
  if ((have.data ?? []).length > 0) return;
  const r = await svc.from('exchange_rates').insert({
    base: 'USD',
    quote,
    rate,
    source: 'manual',
    fetched_at: new Date().toISOString(),
  });
  expect(r.error).toBeNull();
}

/** Un taux PÉRIMÉ (5 jours) et rien de plus récent pour cette monnaie : le coût doit rester en dollars. */
export async function ensureOnlyStaleFx(quote: string, rate: number): Promise<void> {
  const svc = testServiceClient();
  const have = await svc.from('exchange_rates').select('id').eq('quote', quote).limit(1);
  if ((have.data ?? []).length > 0) return;
  const r = await svc.from('exchange_rates').insert({
    base: 'USD',
    quote,
    rate,
    source: 'manual',
    fetched_at: new Date(Date.now() - 5 * 24 * 3_600_000).toISOString(),
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
  copy: Record<string, unknown>;
  targeting: Record<string, unknown>;
  geo: Record<string, unknown>;
  tracking: { pixel_id: string } | null;
  cost: {
    status: string;
    days: number | null;
    budget_usd_cents: number | null;
    total: { local_minor: number; usd_cents: number; currency: string } | null;
    daily: { local_minor: number; usd_cents: number; currency: string } | null;
  };
}

/** Brouillon créé par la route, prêt à être modifié. */
export async function newDraft(s: SeededWorkspace): Promise<CampaignBody> {
  const pageId = await seedPage(s);
  const analysisId = await seedReadyAnalysis(s, pageId);
  const res = await create(s, s.owner, {
    analysis_id: analysisId,
    page_id: pageId,
    platform: 'meta',
  });
  expect(res.status).toBe(201);
  return (await json(res)) as unknown as CampaignBody;
}

/** Date AAAA-MM-JJ dans `days` jours (UTC), pour des dates toujours dans le futur. */
export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const newKey = (): string => randomUUID();

/** Remet à zéro les compteurs de débit : la limite « ai » (20 par heure et par espace) ne doit pas fausser un test. */
export async function resetRateLimits(): Promise<void> {
  await queryTestDb('delete from private.rate_limits');
}
