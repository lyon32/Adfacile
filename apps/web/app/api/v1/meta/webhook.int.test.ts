// Webhook Meta contre la pile Supabase locale (TR-SEC-04, API_SPEC §12, EC-META-09) : signature
// vérifiée sur le corps brut avant tout traitement, jeton d'abonnement, rejeu, objet inconnu.
// Secret et jeton factices, posés avant le premier appel à `getEnv()`.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  queryTestDb,
  seedWorkspace,
  setMaintenance,
  testServiceClient,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { GET as verify, POST as receive } from '../webhooks/meta/route';
import { webhookEventId } from '../webhooks/meta/signature';

const SECRET = randomBytes(16).toString('hex');
const VERIFY_TOKEN = `jeton-${randomUUID()}`;
process.env.META_APP_SECRET = SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
const sign = (raw: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

function post(raw: string, headers: Record<string, string> = {}): Request {
  return new Request(`${APP}/api/v1/webhooks/meta`, { method: 'POST', body: raw, headers });
}
const signedPost = (raw: string) => post(raw, { 'x-hub-signature-256': sign(raw) });
function get(query: Record<string, string>): Request {
  return new Request(`${APP}/api/v1/webhooks/meta?${new URLSearchParams(query).toString()}`);
}

let campaign: { id: string; workspaceId: string; metaId: string };

function body(
  objectId: string,
  over: { time?: number; field?: string; nonce?: string } = {},
): string {
  return JSON.stringify({
    object: 'ad_account',
    entry: [
      {
        id: '100000000001',
        time: over.time ?? nowSeconds(),
        changes: [
          {
            field: over.field ?? 'with_issues_ad_objects',
            value: {
              id: objectId,
              level: 'CAMPAIGN',
              error_code: 1815,
              error_summary: `Problème ${over.nonce ?? ''}`,
            },
          },
        ],
      },
    ],
  });
}

async function statusEvents(campaignId: string) {
  const { data } = await testServiceClient()
    .from('campaign_status_events')
    .select('status, source, workspace_id, payload')
    .eq('campaign_id', campaignId);
  return data ?? [];
}

beforeAll(async () => {
  const s = await seedWorkspace();
  const metaId = `7${String(Date.now()).slice(-10)}`;
  const { data, error } = await testServiceClient()
    .from('campaigns')
    .insert({ workspace_id: s.workspace.id, name: 'Campagne de test', meta_campaign_id: metaId })
    .select('id')
    .single();
  if (error !== null) throw new Error('campagne de test');
  campaign = { id: data.id, workspaceId: s.workspace.id, metaId };
});

describeRoute('metaWebhookVerify', {
  success: async () => {
    const res = verify(
      get({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('1158201444');
  },
  unauthenticated: na('route sans session : le jeton hub.verify_token fait foi (cas 403)'),
  otherWorkspace: na('aucun espace dans l’adresse'),
  forbiddenRole: async () => {
    // Jeton faux, mode inattendu : 403, et le défi n'est jamais renvoyé.
    for (const query of [
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'faux', 'hub.challenge': '42' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': `${VERIFY_TOKEN}x`, 'hub.challenge': '42' },
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '42' },
    ]) {
      const res = verify(get(query));
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain('42');
    }
  },
  invalidBody: () => {
    expect(verify(get({ 'hub.mode': 'subscribe' })).status).toBe(400);
    // Un défi qui n'est pas un entier n'est jamais renvoyé tel quel.
    const res = verify(
      get({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '<script>',
      }),
    );
    expect(res.status).toBe(400);
    return Promise.resolve();
  },
});

describeRoute('metaWebhook', {
  success: async () => {
    const raw = body(campaign.metaId, { nonce: 'succes' });
    const res = await receive(signedPost(raw));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'processed', recorded: 1 });
    const events = await statusEvents(campaign.id);
    expect(events).toContainEqual({
      status: 'with_issues',
      source: 'webhook',
      workspace_id: campaign.workspaceId,
      payload: { level: 'CAMPAIGN', error_code: '1815', error_summary: 'Problème succes' },
    });
    // Le webhook n'est qu'un signal : le statut de la campagne n'a pas bougé (Meta fait foi, S17).
    const row = await testServiceClient()
      .from('campaigns')
      .select('status')
      .eq('id', campaign.id)
      .single();
    expect(row.data?.status).toBe('draft');
  },
  unauthenticated: async () => {
    const raw = body(campaign.metaId, { nonce: 'sans-signature' });
    const before = (await statusEvents(campaign.id)).length;
    for (const headers of [
      {},
      { 'x-hub-signature-256': 'sha256=' },
      { 'x-hub-signature-256': sign(raw, 'b'.repeat(32)) },
      { 'x-hub-signature-256': sign(`${raw} `) },
      { 'x-hub-signature-256': 'sha1=deadbeef' },
    ]) {
      const res = await receive(post(raw, headers));
      expect(res.status).toBe(401);
      expect(((await res.json()) as { code: string }).code).toBe('webhook_signature_invalid');
    }
    // Rien n'a été traité ni enregistré, pas même le registre des événements vus.
    expect(await statusEvents(campaign.id)).toHaveLength(before);
    const seen = await queryTestDb(
      'select 1 from private.webhook_events where provider = $1 and event_id = $2',
      ['meta', webhookEventId(raw)],
    );
    expect(seen).toHaveLength(0);
  },
  otherWorkspace: na('aucun espace dans l’adresse : l’espace est celui de la campagne retrouvée'),
  forbiddenRole: na('route sans session : la signature fait foi (cas 401)'),
  invalidBody: async () => {
    // Corps signé mais illisible ou inconnu : journalisé et ignoré (200), jamais traité au mieux.
    for (const raw of [
      'pas du json',
      '[]',
      JSON.stringify({ object: 'page' }),
      JSON.stringify({ entry: [] }),
    ]) {
      const res = await receive(signedPost(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ignored' });
    }
  },
  extra: {
    'TR-SEC-04 : le même événement deux fois est traité une seule fois': async () => {
      const raw = body(campaign.metaId, { nonce: 'doublon' });
      const first = await receive(signedPost(raw));
      expect(await first.json()).toEqual({ status: 'processed', recorded: 1 });
      const count = (await statusEvents(campaign.id)).length;
      const second = await receive(signedPost(raw));
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ status: 'duplicate' });
      expect(await statusEvents(campaign.id)).toHaveLength(count);
    },
    'Meta relivre un événement échoué pendant 36 h : un événement ancien mais bien signé est ACCEPTÉ, une seule fois':
      async () => {
        const raw = body(campaign.metaId, { time: nowSeconds() - 6 * 3600, nonce: 'relivraison' });
        const before = (await statusEvents(campaign.id)).length;
        const first = await receive(signedPost(raw));
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({ status: 'processed', recorded: 1 });
        const second = await receive(signedPost(raw));
        expect(await second.json()).toEqual({ status: 'duplicate' });
        expect(await statusEvents(campaign.id)).toHaveLength(before + 1);
      },
    'écriture qui échoue : 5xx, rien n’est marqué vu ; la relivraison de Meta est traitée, puis une seule fois':
      async () => {
        const raw = body(campaign.metaId, { nonce: 'panne' });
        const before = (await statusEvents(campaign.id)).length;
        await queryTestDb(
          `create or replace function public.tmp_fail_status_events() returns trigger language plpgsql as $$ begin raise exception 'panne simulée'; end $$`,
        );
        await queryTestDb(
          `create trigger tmp_fail before insert on public.campaign_status_events for each row execute function public.tmp_fail_status_events()`,
        );
        try {
          const failed = await receive(signedPost(raw));
          expect(failed.status).toBeGreaterThanOrEqual(500);
          expect(
            await queryTestDb(
              'select 1 from private.webhook_events where provider = $1 and event_id = $2',
              ['meta', webhookEventId(raw)],
            ),
          ).toHaveLength(0);
        } finally {
          await queryTestDb('drop trigger if exists tmp_fail on public.campaign_status_events');
          await queryTestDb('drop function if exists public.tmp_fail_status_events()');
        }
        const retry = await receive(signedPost(raw));
        expect(retry.status).toBe(200);
        expect(await retry.json()).toEqual({ status: 'processed', recorded: 1 });
        const again = await receive(signedPost(raw));
        expect(await again.json()).toEqual({ status: 'duplicate' });
        expect(await statusEvents(campaign.id)).toHaveLength(before + 1);
      },
    'EC-META-09 : objet inconnu de Pubeka → 200, journalisé, rien d’enregistré': async () => {
      const res = await receive(signedPost(body('699999999999', { nonce: 'inconnu' })));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'processed', recorded: 0 });
    },
    'un champ que Pubeka ne lit pas est ignoré (200)': async () => {
      const before = (await statusEvents(campaign.id)).length;
      const res = await receive(
        signedPost(body(campaign.metaId, { field: 'creative_fatigue', nonce: 'autre' })),
      );
      expect(res.status).toBe(200);
      expect(await statusEvents(campaign.id)).toHaveLength(before);
    },
    'un webhook est traité même en mode maintenance (EC-ADM-02)': async () => {
      await setMaintenance(true, 'Maintenance de test');
      try {
        const res = await receive(signedPost(body(campaign.metaId, { nonce: 'maintenance' })));
        expect(res.status).toBe(200);
      } finally {
        await setMaintenance(false);
      }
    },
  },
});
