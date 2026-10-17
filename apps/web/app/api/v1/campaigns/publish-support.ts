// Aide des tests d'intégration de la publication : un espace PRÊT À PUBLIER dans la vraie base locale (Page active, compte
// publicitaire relié et connexion valide, photo téléversée, campagne complète) et les appels aux routes. Aucune valeur d'ici
// n'est une donnée du produit. Aucun appel à Meta : la file de tâches est remplacée par un enregistreur.
import { randomUUID } from 'node:crypto';
import type { PublishCampaignDeps } from '@pubeka/core';
import { queryTestDb, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { expect } from 'vitest';
import { call, connectWorkspace } from '../meta/int-support';
import { GET as estimateRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/estimate/route';
import { POST as pauseRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/pause/route';
import { POST as publishRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/publish/route';
import { POST as relaunchRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/relaunch/route';
import { POST as resumeRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/resume/route';
import {
  campaignParams,
  create,
  ensureTestFx,
  inDays,
  json,
  patch,
  seedPage,
  seedReadyAnalysis,
  setOwnerCountry,
  type CampaignBody,
} from './int-support';

export { campaignParams, json };

type Who = SeededWorkspace['owner'];

export interface RecordedJob {
  taskId: string;
  payload: unknown;
  key: string;
}

/** File de tâches de test : retient les lancements, une clé déjà vue ne relance rien (comme le vrai lanceur). */
export class JobRecorder {
  readonly jobs: RecordedJob[] = [];
  private readonly seen = new Set<string>();
  readonly events: string[] = [];
  refuse: { code: 'campaign_quota_reached' } | undefined;

  deps(): PublishCampaignDeps {
    return {
      jobs: {
        enqueue: (taskId, payload, key) => {
          if (!this.seen.has(`${taskId}:${key}`)) {
            this.seen.add(`${taskId}:${key}`);
            this.jobs.push({ taskId, payload, key });
          }
          return Promise.resolve();
        },
      },
      beforeSpend: async (campaignId) => {
        this.events.push(`beforeSpend:${campaignId}`);
        if (this.refuse !== undefined) {
          const { AppError } = await import('@pubeka/contracts');
          throw new AppError(this.refuse.code, { meta: { upgrade_to: 'business' } });
        }
      },
      release: (campaignId) => {
        this.events.push(`release:${campaignId}`);
        return Promise.resolve();
      },
      afterAccepted: (campaignId) => {
        this.events.push(`afterAccepted:${campaignId}`);
        return Promise.resolve();
      },
    };
  }

  count(kind: 'beforeSpend' | 'release' | 'afterAccepted'): number {
    return this.events.filter((e) => e.startsWith(`${kind}:`)).length;
  }
}

export interface PublishableCampaign {
  campaign: CampaignBody;
  pageId: string;
  adAccountId: string;
  connectionId: string;
  sourceId: string;
}

/** Connexion complète par la route (fausse Meta) : jeton chiffré, compte et Page réels de la base. */
async function connectedAccount(s: SeededWorkspace): Promise<void> {
  const svc = testServiceClient();
  const have = await svc
    .from('meta_connections')
    .select('id')
    .eq('workspace_id', s.workspace.id)
    .limit(1);
  if ((have.data ?? []).length === 0) {
    const res = await connectWorkspace(s);
    expect([302, 307]).toContain(res.status);
  }
}

async function connectedPage(s: SeededWorkspace): Promise<string> {
  await connectedAccount(s);
  const svc = testServiceClient();
  const page = await svc
    .from('pages')
    .select('id')
    .eq('workspace_id', s.workspace.id)
    .limit(1)
    .single();
  expect(page.error).toBeNull();
  const id = page.data?.id ?? '';
  const ok = await svc
    .from('pages')
    .update({ active: true, whatsapp_linked: true, whatsapp_number: '+237650198196' })
    .eq('id', id);
  expect(ok.error).toBeNull();
  return id;
}

async function connectedAdAccount(
  s: SeededWorkspace,
): Promise<{ adAccountId: string; connectionId: string }> {
  await connectedAccount(s);
  const svc = testServiceClient();
  const account = await svc
    .from('ad_accounts')
    .select('id, meta_connection_id')
    .eq('workspace_id', s.workspace.id)
    .limit(1)
    .single();
  expect(account.error).toBeNull();
  const id = account.data?.id ?? '';
  const ok = await svc
    .from('ad_accounts')
    .update({ has_payment_method: true, currency: 'USD', is_active: true })
    .eq('id', id);
  expect(ok.error).toBeNull();
  return { adAccountId: id, connectionId: account.data?.meta_connection_id ?? '' };
}

/** Un seul compte publicitaire actif par espace : créé une fois (connexion valide, dollars, moyen de paiement présent). */
async function ensureAdAccount(
  s: SeededWorkspace,
): Promise<{ adAccountId: string; connectionId: string }> {
  const svc = testServiceClient();
  const existing = await svc
    .from('ad_accounts')
    .select('id, meta_connection_id')
    .eq('workspace_id', s.workspace.id)
    .eq('is_active', true)
    .maybeSingle();
  if (existing.data !== null) {
    return { adAccountId: existing.data.id, connectionId: existing.data.meta_connection_id };
  }
  const connection = await svc
    .from('meta_connections')
    .insert({
      workspace_id: s.workspace.id,
      token_type: 'user',
      status: 'ok',
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .select('id')
    .single();
  expect(connection.error).toBeNull();
  const connectionId = connection.data?.id ?? '';
  const account = await svc
    .from('ad_accounts')
    .insert({
      workspace_id: s.workspace.id,
      meta_connection_id: connectionId,
      meta_ad_account_id: `act_${String(Math.floor(1e11 + Math.random() * 9e11))}`,
      name: 'Compte de test',
      currency: 'USD',
      has_payment_method: true,
      is_active: true,
    })
    .select('id')
    .single();
  expect(account.error).toBeNull();
  return { adAccountId: account.data?.id ?? '', connectionId };
}

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

/** Espace complet : Page active (WhatsApp relié), connexion Meta valide, compte en dollars, photo, brouillon complet. */
export async function publishableCampaign(
  s: SeededWorkspace,
  options: { connected?: boolean } = {},
): Promise<PublishableCampaign> {
  await ensureTestFx();
  await setOwnerCountry(s, 'CM');
  const svc = testServiceClient();
  // `connected` : la connexion, le compte et la Page viennent de la VRAIE route de connexion (fausse Meta), avec un vrai jeton chiffré.
  const pageId = options.connected === true ? await connectedPage(s) : await seedPage(s);
  const pageUpdate = await svc
    .from('pages')
    .update({ whatsapp_linked: true, whatsapp_number: '+237650198196' })
    .eq('id', pageId);
  expect(pageUpdate.error).toBeNull();

  const { adAccountId, connectionId } =
    options.connected === true ? await connectedAdAccount(s) : await ensureAdAccount(s);

  const analysisId = await seedReadyAnalysis(s, pageId);
  const path = `${s.workspace.id}/${randomUUID()}.jpg`;
  const stored = await svc.storage
    .from('sources')
    .upload(path, PHOTO, { contentType: 'image/jpeg' });
  expect(stored.error).toBeNull();
  const source = await svc
    .from('sources')
    .insert({ workspace_id: s.workspace.id, type: 'image', file_path: path })
    .select('id')
    .single();
  expect(source.error).toBeNull();
  const sourceId = source.data?.id ?? '';
  const linked = await svc
    .from('analyses')
    .update({ source_ids: [sourceId] })
    .eq('id', analysisId);
  expect(linked.error).toBeNull();

  const created = await create(s, s.owner, {
    analysis_id: analysisId,
    page_id: pageId,
    platform: 'meta',
  });
  expect(created.status).toBe(201);
  const draft = (await json(created)) as unknown as CampaignBody;
  const filled = await patch(s, s.owner, draft.id, {
    version: draft.version,
    objective: 'OUTCOME_ENGAGEMENT',
    destination: 'WHATSAPP',
    geo: { countries: ['CM'] },
    daily_budget_usd_cents: 500,
    start_date: inDays(2),
    end_date: inDays(8),
    copy: {
      primary_text: 'Des baskets neuves à Douala.',
      headline: 'Baskets à prix doux',
      cta: 'SEND_WHATSAPP_MESSAGE',
    },
  });
  expect(filled.status).toBe(200);
  return {
    campaign: (await json(filled)) as unknown as CampaignBody,
    pageId,
    adAccountId,
    connectionId,
    sourceId,
  };
}

export function publish(
  s: SeededWorkspace,
  who: Who,
  campaignId: string,
  body: unknown = { accept_liability: true },
  key: string | null = randomUUID(),
): Promise<Response> {
  const id = s.workspace.id;
  return publishRoute(
    call(
      'POST',
      `/workspaces/${id}/campaigns/${campaignId}/publish`,
      { ...who.headers, ...(key === null ? {} : { 'idempotency-key': key }) },
      body,
    ),
    campaignParams(id, campaignId),
  );
}

export async function campaignRow(campaignId: string) {
  const r = await testServiceClient()
    .from('campaigns')
    .select(
      'status, version, editable, publish_attempt, publish_ref, publish_idempotency_key, publish_phase, quota_state, start_date, end_date',
    )
    .eq('id', campaignId)
    .single();
  expect(r.error).toBeNull();
  return r.data;
}

/** Campagne publiée jusqu'au bout (fausse Meta, tâche inline) : « envoyée à Meta », prête à être mise en pause. */
export async function publishedCampaign(s: SeededWorkspace): Promise<PublishableCampaign> {
  const made = await publishableCampaign(s, { connected: true });
  const res = await publish(s, s.owner, made.campaign.id, { accept_liability: true });
  expect(res.status).toBe(202);
  expect((await campaignRow(made.campaign.id))?.status).toBe('in_review');
  return made;
}

/** Pose un statut sans passer par la garde (réplica = déclencheurs coupés), pour atteindre un état de test. */
export async function forceStatus(campaignId: string, status: string): Promise<void> {
  await queryTestDb(
    `set session_replication_role = replica; update public.campaigns set status='${status}' where id='${campaignId}'; set session_replication_role = origin;`,
  );
}

function control(
  route: typeof pauseRoute,
  action: string,
  s: SeededWorkspace,
  who: Who,
  campaignId: string,
  body?: unknown,
): Promise<Response> {
  const id = s.workspace.id;
  return route(
    call('POST', `/workspaces/${id}/campaigns/${campaignId}/${action}`, who.headers, body),
    campaignParams(id, campaignId),
  );
}

export const pause = (s: SeededWorkspace, who: Who, campaignId: string) =>
  control(pauseRoute, 'pause', s, who, campaignId);
export const resume = (s: SeededWorkspace, who: Who, campaignId: string) =>
  control(resumeRoute, 'resume', s, who, campaignId);
export const relaunch = (s: SeededWorkspace, who: Who, campaignId: string, body: unknown) =>
  control(relaunchRoute, 'relaunch', s, who, campaignId, body);

export function estimate(s: SeededWorkspace, who: Who, campaignId: string): Promise<Response> {
  const id = s.workspace.id;
  return estimateRoute(
    call('GET', `/workspaces/${id}/campaigns/${campaignId}/estimate`, who.headers),
    campaignParams(id, campaignId),
  );
}
