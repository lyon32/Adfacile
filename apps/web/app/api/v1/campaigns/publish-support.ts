// Aide des tests d'intégration de la publication : un espace PRÊT À PUBLIER dans la vraie base locale (Page active, compte
// publicitaire relié et connexion valide, photo téléversée, campagne complète) et les appels aux routes. Aucune valeur d'ici
// n'est une donnée du produit. Aucun appel à Meta : la file de tâches est remplacée par un enregistreur.
import { randomUUID } from 'node:crypto';
import type { PublishCampaignDeps } from '@pubeka/core';
import { testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { expect } from 'vitest';
import { call } from '../meta/int-support';
import { POST as publishRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/publish/route';
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
export async function publishableCampaign(s: SeededWorkspace): Promise<PublishableCampaign> {
  await ensureTestFx();
  await setOwnerCountry(s, 'CM');
  const svc = testServiceClient();
  const pageId = await seedPage(s);
  const pageUpdate = await svc
    .from('pages')
    .update({ whatsapp_linked: true, whatsapp_number: '+237650198196' })
    .eq('id', pageId);
  expect(pageUpdate.error).toBeNull();

  const { adAccountId, connectionId } = await ensureAdAccount(s);

  const analysisId = await seedReadyAnalysis(s, pageId);
  const path = `${s.workspace.id}/${randomUUID()}.jpg`;
  const stored = await svc.storage.from('sources').upload(path, PHOTO, { contentType: 'image/jpeg' });
  expect(stored.error).toBeNull();
  const source = await svc
    .from('sources')
    .insert({ workspace_id: s.workspace.id, type: 'image', file_path: path })
    .select('id')
    .single();
  expect(source.error).toBeNull();
  const sourceId = source.data?.id ?? '';
  const linked = await svc.from('analyses').update({ source_ids: [sourceId] }).eq('id', analysisId);
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
