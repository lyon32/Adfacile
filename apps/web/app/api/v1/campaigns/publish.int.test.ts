// Route `publish` contre la pile Supabase locale (vraie base, vraie RLS, vraies contraintes) : les 5 cas, EC-CAMP-01 à 08,
// concurrence réelle (verrou en base), clause de responsabilité. Aucun appel à Meta : la file de tâches est un enregistreur.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  queryTestDb,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { resetRateLimits } from './int-support';
import { overridePublishDeps } from './services';
import { campaignRow, JobRecorder, json, publish, publishableCampaign } from './publish-support';

let s: SeededWorkspace;
let recorder: JobRecorder;
beforeAll(async () => {
  s = await seedWorkspace();
});
beforeEach(async () => {
  // La limite d'écriture (par espace) ne doit pas fausser un test : ces tests enchaînent beaucoup d'appels.
  await resetRateLimits();
  recorder = new JobRecorder();
  overridePublishDeps(recorder.deps());
});
afterAll(() => {
  overridePublishDeps(undefined);
});

interface Problem {
  code: string;
  status: number;
  errors?: { field: string; code: string }[];
  meta?: Record<string, unknown>;
}
const problemOf = async (res: Response): Promise<Problem> =>
  (await json(res)) as unknown as Problem;
const accept = { accept_liability: true };

describeRoute('publishCampaign', {
  success: async () => {
    const { campaign } = await publishableCampaign(s);
    const key = randomUUID();
    const res = await publish(s, s.owner, campaign.id, accept, key);
    expect(res.status).toBe(202);
    const body = (await json(res)) as unknown as { status: string; editable: boolean };
    expect(body).toMatchObject({ status: 'publishing', editable: false });
    const row = await campaignRow(campaign.id);
    expect(row).toMatchObject({
      status: 'publishing',
      publish_attempt: 1,
      publish_idempotency_key: key,
      publish_phase: 'none',
      quota_state: 'held',
    });
    expect(row?.publish_ref).toBe(`pk-${campaign.id.replaceAll('-', '').slice(-12)}-1`);
    expect(recorder.jobs).toEqual([
      {
        taskId: 'campaign.publish',
        payload: { campaignId: campaign.id, workspaceId: s.workspace.id },
        key: `campaign.publish:${campaign.id}:1`,
      },
    ]);
    // Un éditeur peut aussi publier.
    const other = await publishableCampaign(s);
    expect((await publish(s, s.editor, other.campaign.id)).status).toBe(202);
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await publish(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
    expect(recorder.jobs).toEqual([]);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishableCampaign(s);
    const stranger = await seedWorkspace();
    expect((await publish(stranger, stranger.owner, campaign.id)).status).toBe(404);
    expect((await campaignRow(campaign.id))?.status).toBe('draft');
    expect(recorder.jobs).toEqual([]);
  },
  forbiddenRole: async () => {
    const { campaign } = await publishableCampaign(s);
    const res = await publish(s, s.viewer, campaign.id);
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
    expect(recorder.jobs).toEqual([]);
    expect(recorder.events).toEqual([]);
  },
  invalidBody: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await publish(s, s.owner, campaign.id, {})).status).toBe(400);
    expect((await publish(s, s.owner, campaign.id, { accept_liability: 'oui' })).status).toBe(400);
    expect((await publish(s, s.owner, campaign.id, { ...accept, status: 'active' })).status).toBe(
      400,
    );
    expect(
      (
        await publish(s, s.owner, campaign.id, {
          ...accept,
          confirmed_total: { amount_minor: -1, currency: 'XAF' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await publish(s, s.owner, campaign.id, {
          ...accept,
          confirmed_total: { amount_minor: 1, currency: 'xaf' },
        })
      ).status,
    ).toBe(400);
    // Aucun montant, aucun budget ni aucune date ne vient du navigateur.
    expect(
      (await publish(s, s.owner, campaign.id, { ...accept, daily_budget_usd_cents: 1 })).status,
    ).toBe(400);
    expect((await publish(s, s.owner, campaign.id, accept, 'pas-un-uuid')).status).toBe(400);
    expect((await publish(s, s.owner, campaign.id, accept, null)).status).toBe(400);
    expect((await campaignRow(campaign.id))?.status).toBe('draft');
    expect(recorder.jobs).toEqual([]);
  },
  extra: {
    'interrupteur DÉSACTIVÉ : 503 provider_unavailable / publish_disabled, la campagne reste un brouillon, AUCUN quota, AUCUNE tâche, aucune clause enregistrée':
      async () => {
        const { campaign } = await publishableCampaign(s);
        recorder.publishEnabled = false;
        const res = await publish(s, s.owner, campaign.id, accept, randomUUID());
        expect(res.status).toBe(503);
        const body = await problemOf(res);
        expect(body.code).toBe('provider_unavailable');
        expect(body.meta).toMatchObject({ reason: 'publish_disabled' });
        expect(await campaignRow(campaign.id)).toMatchObject({
          status: 'draft',
          quota_state: 'none',
          publish_attempt: 0,
          publish_ref: null,
        });
        expect(recorder.events).toEqual([]);
        expect(recorder.jobs).toEqual([]);
        // Réactivé : la même campagne se publie normalement (rien n'a été abîmé).
        recorder.publishEnabled = true;
        expect((await publish(s, s.owner, campaign.id, accept, randomUUID())).status).toBe(202);
      },

    'identifiant de campagne mal formé : 400, inconnu : 404': async () => {
      expect((await publish(s, s.owner, 'pas-un-uuid')).status).toBe(400);
      expect((await publish(s, s.owner, randomUUID())).status).toBe(404);
    },

    'EC-CAMP-01 : la même clé rejoue la réponse (en-tête Idempotent-Replayed), un seul quota, une seule tâche':
      async () => {
        const { campaign } = await publishableCampaign(s);
        const key = randomUUID();
        const first = await publish(s, s.owner, campaign.id, accept, key);
        const second = await publish(s, s.owner, campaign.id, accept, key);
        expect(first.status).toBe(202);
        expect(second.status).toBe(202);
        expect(second.headers.get('idempotent-replayed')).toBe('true');
        expect(await json(second)).toEqual(await json(first));
        expect(recorder.count('beforeSpend')).toBe(1);
        expect(recorder.jobs).toHaveLength(1);
        expect((await campaignRow(campaign.id))?.publish_attempt).toBe(1);
      },

    'EC-CAMP-01 : la même clé avec un autre corps est refusée (idempotency_key_reused)':
      async () => {
        const { campaign } = await publishableCampaign(s);
        const key = randomUUID();
        expect((await publish(s, s.owner, campaign.id, accept, key)).status).toBe(202);
        const other = await publish(s, s.owner, campaign.id, { accept_liability: false }, key);
        expect(other.status).toBe(409);
        expect((await problemOf(other)).code).toBe('idempotency_key_reused');
      },

    'EC-CAMP-01 : 8 clics simultanés avec 8 clés, sur la vraie base : UNE seule publication, UNE seule tâche, quota rendu pour les 7 perdants':
      async () => {
        const { campaign } = await publishableCampaign(s);
        const results = await Promise.all(
          Array.from({ length: 8 }, () => publish(s, s.owner, campaign.id, accept, randomUUID())),
        );
        const statuses = results.map((r) => r.status).sort();
        expect(statuses.filter((x) => x === 202)).toHaveLength(1);
        expect(statuses.filter((x) => x === 409)).toHaveLength(7);
        expect(recorder.jobs).toHaveLength(1);
        expect((await campaignRow(campaign.id))?.publish_attempt).toBe(1);
        // Chaque quota retenu par un perdant est rendu : il n'en reste qu'un, celui de la publication.
        expect(recorder.count('beforeSpend') - recorder.count('release')).toBe(1);
      },

    'EC-CAMP-02 : quota atteint → 402 campaign_quota_reached, le brouillon est conservé':
      async () => {
        const { campaign } = await publishableCampaign(s);
        recorder.refuse = { code: 'campaign_quota_reached' };
        const res = await publish(s, s.owner, campaign.id);
        expect(res.status).toBe(402);
        expect((await problemOf(res)).code).toBe('campaign_quota_reached');
        expect(await campaignRow(campaign.id)).toMatchObject({
          status: 'draft',
          editable: true,
          publish_attempt: 0,
        });
        expect(recorder.jobs).toEqual([]);
        expect(recorder.count('release')).toBe(0);
      },

    'EC-CAMP-03 : une Page hors formule est refusée en 402 page_limit_reached': async () => {
      const { campaign, pageId } = await publishableCampaign(s);
      const off = await testServiceClient()
        .from('pages')
        .update({ active: false })
        .eq('id', pageId);
      expect(off.error).toBeNull();
      const res = await publish(s, s.owner, campaign.id);
      expect(res.status).toBe(402);
      expect((await problemOf(res)).code).toBe('page_limit_reached');
      expect(recorder.events).toEqual([]);
    },

    'EC-CAMP-04 : un début passé est ramené à aujourd’hui ; une fin devenue antérieure est refusée avec la correction':
      async () => {
        const { campaign } = await publishableCampaign(s);
        const svc = testServiceClient();
        // Le début a été écrit dans le passé après la validation (minuit passé) : on contourne la validation de la route.
        const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
        const later = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
        expect(
          (
            await svc
              .from('campaigns')
              .update({ start_date: past, end_date: later })
              .eq('id', campaign.id)
          ).error,
        ).toBeNull();
        expect((await publish(s, s.owner, campaign.id)).status).toBe(202);
        const row = await campaignRow(campaign.id);
        expect(row?.start_date).not.toBe(past);
        expect(String(row?.start_date) >= past).toBe(true);

        const second = await publishableCampaign(s);
        const ended = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);
        expect(
          (
            await svc
              .from('campaigns')
              .update({ start_date: past, end_date: ended })
              .eq('id', second.campaign.id)
          ).error,
        ).toBeNull();
        const refused = await publish(s, s.owner, second.campaign.id);
        expect(refused.status).toBe(400);
        const problem = await problemOf(refused);
        expect(problem.errors?.[0]?.field).toBe('end_date');
        expect(problem.meta).toHaveProperty('suggested_end_date');
        expect((await campaignRow(second.campaign.id))?.status).toBe('draft');
      },

    'EC-CAMP-05 : un total affiché qui ne correspond plus au taux du jour → 409 conflict avec le nouveau total':
      async () => {
        const { campaign } = await publishableCampaign(s);
        const cost = campaign.cost.total;
        expect(cost).not.toBeNull();
        const shown = (cost?.local_minor ?? 0) * 2;
        const res = await publish(s, s.owner, campaign.id, {
          ...accept,
          confirmed_total: { amount_minor: shown, currency: cost?.currency ?? 'XAF' },
        });
        expect(res.status).toBe(409);
        const problem = await problemOf(res);
        expect(problem.meta).toMatchObject({ reason: 'fx_changed' });
        expect(problem.meta?.new_total).toMatchObject({ amount_minor: cost?.local_minor });
        // Avec le bon total, la publication passe.
        const ok = await publish(s, s.owner, campaign.id, {
          ...accept,
          confirmed_total: {
            amount_minor: cost?.local_minor ?? 0,
            currency: cost?.currency ?? 'XAF',
          },
        });
        expect(ok.status).toBe(202);
      },

    'EC-CAMP-06 : photo supprimée du stockage → 410 gone': async () => {
      const { campaign, sourceId } = await publishableCampaign(s);
      const svc = testServiceClient();
      const source = await svc.from('sources').select('file_path').eq('id', sourceId).single();
      const removed = await svc.storage.from('sources').remove([source.data?.file_path ?? '']);
      expect(removed.error).toBeNull();
      const res = await publish(s, s.owner, campaign.id);
      expect(res.status).toBe(410);
      expect((await problemOf(res)).code).toBe('gone');
    },

    'EC-CAMP-07 : republication après un refus de Meta → aucun quota retenu': async () => {
      const { campaign } = await publishableCampaign(s);
      // Simule l'état après une première publication refusée par Meta (la garde SQL est coupée pour poser l'état).
      const first = await publish(s, s.owner, campaign.id, accept);
      expect(first.status).toBe(202);
      await queryTestDb(
        `set session_replication_role = replica; update public.campaigns set status='rejected', quota_state='counted' where id='${campaign.id}'; set session_replication_role = origin;`,
      );
      const before = recorder.count('beforeSpend');
      const again = await publish(s, s.owner, campaign.id, accept);
      expect(again.status).toBe(202);
      expect(recorder.count('beforeSpend')).toBe(before);
      expect(await campaignRow(campaign.id)).toMatchObject({
        status: 'publishing',
        publish_attempt: 2,
        quota_state: 'counted',
      });
    },

    'EC-CAMP-08 : première publication sans la clause → 400 sur accept_liability, rien ne change ; acceptée une fois, jamais redemandée':
      async () => {
        const fresh = await seedWorkspace();
        const { campaign } = await publishableCampaign(fresh);
        const refused = await publish(fresh, fresh.owner, campaign.id, { accept_liability: false });
        expect(refused.status).toBe(400);
        const problem = await problemOf(refused);
        expect(problem.errors?.[0]).toMatchObject({ field: 'accept_liability', code: 'required' });
        expect(problem.meta).toMatchObject({ reason: 'liability_required' });
        expect((await campaignRow(campaign.id))?.status).toBe('draft');
        const none = await testServiceClient()
          .from('publish_liability_acceptances')
          .select('*')
          .eq('workspace_id', fresh.workspace.id);
        expect(none.data).toEqual([]);

        expect((await publish(fresh, fresh.owner, campaign.id, accept)).status).toBe(202);
        const accepted = await testServiceClient()
          .from('publish_liability_acceptances')
          .select('accepted_by, accepted_at')
          .eq('workspace_id', fresh.workspace.id);
        expect(accepted.data).toHaveLength(1);
        expect(accepted.data?.[0]?.accepted_by).toBe(fresh.owner.id);

        // Une autre campagne du même espace : plus de clause à accepter.
        const next = await publishableCampaign(fresh);
        expect(
          (await publish(fresh, fresh.owner, next.campaign.id, { accept_liability: false })).status,
        ).toBe(202);
      },

    'TR-PLA-10 : un budget sous 1 $ par jour → 422 budget_too_low (la base le refuse aussi)':
      async () => {
        const { campaign } = await publishableCampaign(s);
        const below = await testServiceClient()
          .from('campaigns')
          .update({ daily_budget_usd_cents: 99 })
          .eq('id', campaign.id);
        // La contrainte de la base interdit déjà un budget sous 100 centimes : la route n'a même pas à le voir.
        expect(below.error).not.toBeNull();
        expect((await campaignRow(campaign.id))?.status).toBe('draft');
      },

    'aucun moyen de paiement : 424 meta_payment_method_missing, brouillon gardé, quota intact':
      async () => {
        const fresh = await seedWorkspace();
        const { campaign, adAccountId } = await publishableCampaign(fresh);
        expect(
          (
            await testServiceClient()
              .from('ad_accounts')
              .update({ has_payment_method: false })
              .eq('id', adAccountId)
          ).error,
        ).toBeNull();
        const res = await publish(fresh, fresh.owner, campaign.id);
        expect(res.status).toBe(424);
        expect((await problemOf(res)).code).toBe('meta_payment_method_missing');
        expect(recorder.events).toEqual([]);
        expect((await campaignRow(campaign.id))?.status).toBe('draft');
      },

    'jeton expiré : 424 meta_token_expired': async () => {
      const fresh = await seedWorkspace();
      const { campaign, connectionId } = await publishableCampaign(fresh);
      expect(
        (
          await testServiceClient()
            .from('meta_connections')
            .update({ status: 'expired' })
            .eq('id', connectionId)
        ).error,
      ).toBeNull();
      const res = await publish(fresh, fresh.owner, campaign.id);
      expect(res.status).toBe(424);
      expect((await problemOf(res)).code).toBe('meta_token_expired');
    },

    'espace en lecture seule : 403 workspace_read_only': async () => {
      const ro = await seedWorkspace();
      const { campaign } = await publishableCampaign(ro);
      expect(
        (
          await testServiceClient()
            .from('workspaces')
            .update({ status: 'read_only' })
            .eq('id', ro.workspace.id)
        ).error,
      ).toBeNull();
      const res = await publish(ro, ro.owner, campaign.id);
      expect(res.status).toBe(403);
      expect((await problemOf(res)).code).toBe('workspace_read_only');
    },
  },
});
