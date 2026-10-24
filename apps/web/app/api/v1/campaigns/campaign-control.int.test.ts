// Pause, reprise et relance contre la vraie base locale, avec la FAUSSE Meta (aucun appel réel) : les 5 cas de chaque route,
// la pause permise en lecture seule et hors formule (EC-CAMP-09), pas de faux succès quand Meta ne répond pas (EC-META-07),
// la relance d'une campagne arrêtée par le client (message de Meta traduit si elle échoue) et la copie en brouillon (F9).
import { randomUUID } from 'node:crypto';
import { AppError } from '@pubeka/contracts';
import { FAKE_EXPIRED_TOKEN, FakeMetaConnector, type CampaignControlDeps } from '@pubeka/core';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetRateLimits } from './int-support';
import {
  campaignRow,
  estimate,
  forceStatus,
  json,
  pause,
  publishableCampaign,
  publishedCampaign,
  relaunch,
  resume,
} from './publish-support';
import { overrideControlDeps, overridePublishDeps } from './services';

let s: SeededWorkspace;
beforeAll(async () => {
  s = await seedWorkspace();
});
beforeEach(async () => {
  await resetRateLimits();
  overridePublishDeps(undefined);
  overrideControlDeps(undefined);
});
afterAll(() => {
  overrideControlDeps(undefined);
});

interface Problem {
  code: string;
  status: number;
  meta?: Record<string, unknown>;
  errors?: { field: string; code: string }[];
}
const problemOf = async (res: Response): Promise<Problem> =>
  (await json(res)) as unknown as Problem;
const bodyOf = async (res: Response) =>
  (await json(res)) as unknown as {
    id: string;
    status: string;
    version: number;
    paused_at: string | null;
    name: string;
  };

async function idsOf(campaignId: string) {
  const row = await testServiceClient()
    .from('campaigns')
    .select('meta_campaign_id, meta_adset_id')
    .eq('id', campaignId)
    .single();
  const ad = await testServiceClient()
    .from('ads')
    .select('meta_ad_id, meta_creative_id')
    .eq('campaign_id', campaignId)
    .limit(1)
    .single();
  return {
    campaignId: row.data?.meta_campaign_id ?? '',
    adsetId: row.data?.meta_adset_id ?? null,
    adId: ad.data?.meta_ad_id ?? null,
    creativeId: ad.data?.meta_creative_id ?? null,
  };
}

/** Fausse Meta qui connaît la campagne publiée (mêmes identifiants), pour simuler ses pannes. */
async function fakeKnowing(
  campaignId: string,
  status: 'active' | 'paused' = 'active',
): Promise<{ fake: FakeMetaConnector; deps: CampaignControlDeps }> {
  const fake = new FakeMetaConnector();
  const refs = await idsOf(campaignId);
  const token = { accessToken: 'jeton-de-test', expiresAt: null };
  const created = await fake.createCampaign(token, {
    campaignName: 'x',
    objective: 'OUTCOME_ENGAGEMENT',
    adAccountId: 'act_100000000001',
    account: { code: 'USD' },
    page: {
      id: '200000000001',
      name: 'x',
      instagramAccountId: null,
      instagramConnected: false,
      whatsappConnected: true,
      whatsappNumber: '+237650198196',
      whatsappPhoneNumberId: null,
    },
    dailyBudgetUsdCents: 500,
    startDate: '2026-10-20',
    targeting: { locations: [{ key: 'CM', type: 'country' }] },
    creative: {},
  });
  // La campagne de la fausse Meta porte les identifiants enregistrés par la publication.
  const known = fake.campaigns.get(created.campaignId);
  if (known !== undefined) {
    fake.campaigns.delete(created.campaignId);
    known.refs = { ...refs, adAccountId: 'act_100000000001' };
    known.status = status;
    fake.campaigns.set(refs.campaignId, known);
  }
  return {
    fake,
    deps: {
      connector: fake,
      loadToken: () => Promise.resolve({ accessToken: 'jeton-de-test', expiresAt: null }),
      metaPublishEnabled: () => true,
    },
  };
}

describeRoute('pauseCampaign', {
  success: async () => {
    const { campaign } = await publishedCampaign(s);
    const res = await pause(s, s.owner, campaign.id);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toMatchObject({ status: 'paused' });
    expect(body.paused_at).not.toBeNull();
    expect((await campaignRow(campaign.id))?.status).toBe('paused');
    // Déjà en pause : toujours 200.
    expect((await pause(s, s.owner, campaign.id)).status).toBe(200);
    // Un éditeur peut aussi.
    const other = await publishedCampaign(s);
    expect((await pause(s, s.editor, other.campaign.id)).status).toBe(200);
  },
  unauthenticated: async () => {
    const { campaign } = await publishedCampaign(s);
    expect((await pause(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
    expect((await campaignRow(campaign.id))?.status).toBe('in_review');
  },
  otherWorkspace: async () => {
    const { campaign } = await publishedCampaign(s);
    const stranger = await seedWorkspace();
    expect((await pause(stranger, stranger.owner, campaign.id)).status).toBe(404);
    expect((await campaignRow(campaign.id))?.status).toBe('in_review');
  },
  forbiddenRole: async () => {
    const { campaign } = await publishedCampaign(s);
    const res = await pause(s, s.viewer, campaign.id);
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
  },
  invalidBody: na('POST sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; inconnu : 404': async () => {
      expect((await pause(s, s.owner, 'pas-un-uuid')).status).toBe(400);
      expect((await pause(s, s.owner, randomUUID())).status).toBe(404);
    },
    'EC-CAMP-09 / §2.1 : la pause reste permise en lecture seule ET pour une Page hors formule':
      async () => {
        const ro = await seedWorkspace();
        const { campaign, pageId } = await publishedCampaign(ro);
        const svc = testServiceClient();
        expect(
          (await svc.from('workspaces').update({ status: 'read_only' }).eq('id', ro.workspace.id))
            .error,
        ).toBeNull();
        expect(
          (await svc.from('pages').update({ active: false }).eq('id', pageId)).error,
        ).toBeNull();
        const res = await pause(ro, ro.owner, campaign.id);
        expect(res.status).toBe(200);
        expect((await bodyOf(res)).status).toBe('paused');
      },
    'EC-META-07 : Meta ne répond pas → 502 meta_error, la campagne n’est PAS affichée en pause':
      async () => {
        const { campaign } = await publishedCampaign(s);
        const { fake, deps } = await fakeKnowing(campaign.id);
        overrideControlDeps(deps);
        fake.simulateTransientError(1);
        const res = await pause(s, s.owner, campaign.id);
        expect(res.status).toBe(502);
        expect((await problemOf(res)).code).toBe('meta_error');
        expect((await campaignRow(campaign.id))?.status).toBe('in_review');
        // Au clic suivant, ça passe.
        expect((await pause(s, s.owner, campaign.id)).status).toBe(200);
      },
    'jeton refusé par Meta : 424 meta_token_expired, rien ne change': async () => {
      const { campaign } = await publishedCampaign(s);
      const { deps } = await fakeKnowing(campaign.id);
      overrideControlDeps({ ...deps, loadToken: () => Promise.resolve(FAKE_EXPIRED_TOKEN) });
      const res = await pause(s, s.owner, campaign.id);
      expect(res.status).toBe(424);
      expect((await problemOf(res)).code).toBe('meta_token_expired');
      expect((await campaignRow(campaign.id))?.status).toBe('in_review');
    },
    'une campagne terminée ne se met pas en pause : 409': async () => {
      const { campaign } = await publishedCampaign(s);
      await forceStatus(campaign.id, 'ended');
      const res = await pause(s, s.owner, campaign.id);
      expect(res.status).toBe(409);
    },
  },
});

describeRoute('resumeCampaign', {
  success: async () => {
    const { campaign } = await publishedCampaign(s);
    expect((await pause(s, s.owner, campaign.id)).status).toBe(200);
    const res = await resume(s, s.owner, campaign.id);
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toMatchObject({ status: 'active', paused_at: null });
    // Déjà en diffusion : toujours 200.
    expect((await resume(s, s.owner, campaign.id)).status).toBe(200);
  },
  unauthenticated: async () => {
    const { campaign } = await publishedCampaign(s);
    expect((await resume(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishedCampaign(s);
    const stranger = await seedWorkspace();
    expect((await resume(stranger, stranger.owner, campaign.id)).status).toBe(404);
  },
  forbiddenRole: async () => {
    const { campaign } = await publishedCampaign(s);
    expect((await pause(s, s.owner, campaign.id)).status).toBe(200);
    const res = await resume(s, s.viewer, campaign.id);
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
    expect((await campaignRow(campaign.id))?.status).toBe('paused');
  },
  invalidBody: na('POST sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400': async () => {
      expect((await resume(s, s.owner, 'pas-un-uuid')).status).toBe(400);
    },
    'lecture seule : la reprise est refusée (403 workspace_read_only)': async () => {
      const ro = await seedWorkspace();
      const { campaign } = await publishedCampaign(ro);
      expect((await pause(ro, ro.owner, campaign.id)).status).toBe(200);
      expect(
        (
          await testServiceClient()
            .from('workspaces')
            .update({ status: 'read_only' })
            .eq('id', ro.workspace.id)
        ).error,
      ).toBeNull();
      const res = await resume(ro, ro.owner, campaign.id);
      expect(res.status).toBe(403);
      expect((await problemOf(res)).code).toBe('workspace_read_only');
    },
    'EC-CAMP-09 : Page hors formule → 402 page_limit_reached': async () => {
      const fresh = await seedWorkspace();
      const { campaign, pageId } = await publishedCampaign(fresh);
      expect((await pause(fresh, fresh.owner, campaign.id)).status).toBe(200);
      expect(
        (await testServiceClient().from('pages').update({ active: false }).eq('id', pageId)).error,
      ).toBeNull();
      const res = await resume(fresh, fresh.owner, campaign.id);
      expect(res.status).toBe(402);
      expect((await problemOf(res)).code).toBe('page_limit_reached');
      expect((await campaignRow(campaign.id))?.status).toBe('paused');
    },
  },
});

describeRoute('relaunchCampaign', {
  success: async () => {
    // Mode « recover » : la campagne arrêtée repart quand le CLIENT le demande (200).
    const { campaign } = await publishedCampaign(s);
    await forceStatus(campaign.id, 'stopped');
    const version = (await campaignRow(campaign.id))?.version ?? 1;
    const res = await relaunch(s, s.owner, campaign.id, { mode: 'recover', version });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toMatchObject({ id: campaign.id, status: 'active' });

    // Mode « copy » : un nouveau brouillon (201), compté comme une nouvelle campagne.
    const copied = await relaunch(s, s.owner, campaign.id, { mode: 'copy', visual_mode: 'same' });
    expect(copied.status).toBe(201);
    const draft = await bodyOf(copied);
    expect(draft.id).not.toBe(campaign.id);
    expect(draft).toMatchObject({ status: 'draft', version: 1 });
    expect(draft.name).toContain('(copie)');
    const row = await campaignRow(draft.id);
    expect(row).toMatchObject({
      status: 'draft',
      publish_attempt: 0,
      quota_state: 'none',
      publish_ref: null,
    });
  },
  unauthenticated: async () => {
    const { campaign } = await publishedCampaign(s);
    expect(
      (
        await relaunch(s, { ...s.owner, headers: {} }, campaign.id, {
          mode: 'copy',
          visual_mode: 'same',
        })
      ).status,
    ).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishedCampaign(s);
    const stranger = await seedWorkspace();
    expect(
      (await relaunch(stranger, stranger.owner, campaign.id, { mode: 'copy', visual_mode: 'same' }))
        .status,
    ).toBe(404);
  },
  forbiddenRole: async () => {
    const { campaign } = await publishedCampaign(s);
    const res = await relaunch(s, s.viewer, campaign.id, { mode: 'copy', visual_mode: 'same' });
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const { campaign } = await publishedCampaign(s);
    expect((await relaunch(s, s.owner, campaign.id, {})).status).toBe(400);
    expect((await relaunch(s, s.owner, campaign.id, { mode: 'inconnu' })).status).toBe(400);
    expect((await relaunch(s, s.owner, campaign.id, { mode: 'recover' })).status).toBe(400);
    expect((await relaunch(s, s.owner, campaign.id, { mode: 'recover', version: 0 })).status).toBe(
      400,
    );
    expect((await relaunch(s, s.owner, campaign.id, { mode: 'copy' })).status).toBe(400);
    expect(
      (await relaunch(s, s.owner, campaign.id, { mode: 'copy', visual_mode: 'autre' })).status,
    ).toBe(400);
    expect(
      (
        await relaunch(s, s.owner, campaign.id, {
          mode: 'copy',
          visual_mode: 'same',
          status: 'active',
        })
      ).status,
    ).toBe(400);
  },
  extra: {
    'recover : version périmée → 409, Meta n’est pas appelé': async () => {
      const { campaign } = await publishedCampaign(s);
      await forceStatus(campaign.id, 'stopped');
      const res = await relaunch(s, s.owner, campaign.id, { mode: 'recover', version: 999 });
      expect(res.status).toBe(409);
      expect((await problemOf(res)).meta).toMatchObject({ reason: 'stale_version' });
      expect((await campaignRow(campaign.id))?.status).toBe('stopped');
    },
    'recover : Meta refuse (compte encore en défaut) → son message traduit remonte, la campagne reste arrêtée':
      async () => {
        const { campaign } = await publishedCampaign(s);
        await forceStatus(campaign.id, 'stopped');
        const { fake, deps } = await fakeKnowing(campaign.id, 'paused');
        overrideControlDeps(deps);
        fake.simulateResumeRefusal(
          new AppError('meta_payment_method_missing', {
            meta: {
              title: 'Compte publicitaire indisponible',
              message:
                'Votre compte publicitaire Facebook est désactivé ou son moyen de paiement est invalide.',
              fix: 'billing',
            },
          }),
        );
        const version = (await campaignRow(campaign.id))?.version ?? 1;
        const res = await relaunch(s, s.owner, campaign.id, { mode: 'recover', version });
        expect(res.status).toBe(424);
        const problem = await problemOf(res);
        expect(problem.code).toBe('meta_payment_method_missing');
        expect(problem.meta).toMatchObject({
          title: 'Compte publicitaire indisponible',
          fix: 'billing',
        });
        expect((await campaignRow(campaign.id))?.status).toBe('stopped');
      },
    'recover : une campagne qui n’est pas arrêtée → 409': async () => {
      const { campaign } = await publishedCampaign(s);
      const res = await relaunch(s, s.owner, campaign.id, {
        mode: 'recover',
        version: (await campaignRow(campaign.id))?.version ?? 1,
      });
      expect(res.status).toBe(409);
    },
    'copy : de nouveaux visuels ne sont pas encore possibles → 400 sur visual_mode, rien n’est créé':
      async () => {
        const { campaign } = await publishedCampaign(s);
        const before = await testServiceClient()
          .from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', s.workspace.id);
        const res = await relaunch(s, s.owner, campaign.id, {
          mode: 'copy',
          visual_mode: 'change',
        });
        expect(res.status).toBe(400);
        expect((await problemOf(res)).errors?.[0]).toMatchObject({
          field: 'visual_mode',
          code: 'unsupported',
        });
        const after = await testServiceClient()
          .from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', s.workspace.id);
        expect(after.count).toBe(before.count);
      },
    'lecture seule : la relance est refusée (403)': async () => {
      const ro = await seedWorkspace();
      const { campaign } = await publishedCampaign(ro);
      expect(
        (
          await testServiceClient()
            .from('workspaces')
            .update({ status: 'read_only' })
            .eq('id', ro.workspace.id)
        ).error,
      ).toBeNull();
      const res = await relaunch(ro, ro.owner, campaign.id, { mode: 'copy', visual_mode: 'same' });
      expect(res.status).toBe(403);
    },
  },
});

describeRoute('getReachEstimate', {
  success: async () => {
    const { campaign } = await publishableCampaign(s, { connected: true });
    const { fake, deps } = await fakeKnowing(campaign.id);
    overrideControlDeps(deps);
    fake.simulateEstimate({ lowerBound: 120000, upperBound: 150000 });
    const created = fake.createAttempts;
    const res = await estimate(s, s.owner, campaign.id);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      status: 'ok',
      reason: null,
      audience: { lower: 120000, upper: 150000 },
      source: 'meta_delivery_estimate',
    });
    // Lecture seule : rien n'est créé, la campagne ne bouge pas.
    expect((await campaignRow(campaign.id))?.status).toBe('draft');
    expect(fake.createAttempts).toBe(created);
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s, { connected: true });
    expect((await estimate(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishableCampaign(s, { connected: true });
    const stranger = await seedWorkspace();
    expect((await estimate(stranger, stranger.owner, campaign.id)).status).toBe(404);
  },
  forbiddenRole: na(
    'la lecture est permise à tout membre, y compris « viewer » (estimation en lecture seule)',
  ),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; inconnu : 404': async () => {
      expect((await estimate(s, s.owner, 'pas-un-uuid')).status).toBe(400);
      expect((await estimate(s, s.owner, randomUUID())).status).toBe(404);
    },
    'Meta ne donne pas d’estimation : 200 « unavailable » et AUCUNE audience (pas de chiffre inventé)':
      async () => {
        const { campaign } = await publishableCampaign(s, { connected: true });
        const { fake, deps } = await fakeKnowing(campaign.id);
        overrideControlDeps(deps);
        fake.simulateEstimate(null);
        const body = await json(await estimate(s, s.owner, campaign.id));
        expect(body).toMatchObject({ status: 'unavailable', reason: 'not_ready', audience: null });
      },
    'Meta ne répond pas : 200 « unavailable » (jamais une erreur à l’écran)': async () => {
      const { campaign } = await publishableCampaign(s, { connected: true });
      const { fake, deps } = await fakeKnowing(campaign.id);
      overrideControlDeps(deps);
      fake.simulateTransientError(5);
      const res = await estimate(s, s.owner, campaign.id);
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({
        status: 'unavailable',
        reason: 'meta_unavailable',
        audience: null,
      });
    },
    'un lecteur voit l’estimation, même en lecture seule de l’espace': async () => {
      const ro = await seedWorkspace();
      const { campaign } = await publishableCampaign(ro, { connected: true });
      const { fake, deps } = await fakeKnowing(campaign.id);
      overrideControlDeps(deps);
      fake.simulateEstimate({ lowerBound: 5, upperBound: 9 });
      expect(
        (
          await testServiceClient()
            .from('workspaces')
            .update({ status: 'read_only' })
            .eq('id', ro.workspace.id)
        ).error,
      ).toBeNull();
      expect((await estimate(ro, ro.viewer, campaign.id)).status).toBe(200);
    },
  },
});

describe('interrupteur de publication réelle (PUBEKA_META_PUBLISH), vraie base et vraies routes', () => {
  it('DÉSACTIVÉ : la reprise et la relance « recover » sont refusées en 503 publish_disabled, la fausse Meta n’est JAMAIS appelée, les statuts ne changent pas', async () => {
    const paused = await publishedCampaign(s);
    const stopped = await publishedCampaign(s);
    expect((await pause(s, s.owner, paused.campaign.id)).status).toBe(200);
    await forceStatus(stopped.campaign.id, 'stopped');
    const a = await fakeKnowing(paused.campaign.id, 'paused');
    const b = await fakeKnowing(stopped.campaign.id, 'paused');
    overrideControlDeps({ ...a.deps, metaPublishEnabled: () => false });
    const resumed = await resume(s, s.owner, paused.campaign.id);
    expect(resumed.status).toBe(503);
    const body = await problemOf(resumed);
    expect(body.code).toBe('provider_unavailable');
    expect(body.meta).toMatchObject({ reason: 'publish_disabled' });
    expect(a.fake.resumeAttempts).toBe(0);
    expect((await campaignRow(paused.campaign.id))?.status).toBe('paused');

    overrideControlDeps({ ...b.deps, metaPublishEnabled: () => false });
    const version = (await campaignRow(stopped.campaign.id))?.version ?? 0;
    const relaunched = await relaunch(s, s.owner, stopped.campaign.id, {
      mode: 'recover',
      version,
    });
    expect(relaunched.status).toBe(503);
    expect((await problemOf(relaunched)).meta).toMatchObject({ reason: 'publish_disabled' });
    expect(b.fake.resumeAttempts).toBe(0);
    expect((await campaignRow(stopped.campaign.id))?.status).toBe('stopped');
  });

  it('DÉSACTIVÉ : la PAUSE reste permise (elle arrête la dépense) et la fausse Meta reçoit l’ordre', async () => {
    const { campaign } = await publishedCampaign(s);
    const { fake, deps } = await fakeKnowing(campaign.id, 'active');
    overrideControlDeps({ ...deps, metaPublishEnabled: () => false });
    const res = await pause(s, s.owner, campaign.id);
    expect(res.status).toBe(200);
    expect(fake.pauseAttempts).toBe(1);
    expect((await campaignRow(campaign.id))?.status).toBe('paused');
  });
});
