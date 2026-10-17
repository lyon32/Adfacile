// Route « readiness » contre la vraie base locale (vraie URL signée du stockage local) : les 5 cas et les états utiles aux écrans.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, beforeEach, expect } from 'vitest';
import { resetRateLimits } from './int-support';
import { json, publish, publishableCampaign, readiness } from './publish-support';
import { overridePublishDeps } from './services';

let s: SeededWorkspace;
beforeAll(async () => {
  s = await seedWorkspace();
});
beforeEach(async () => {
  await resetRateLimits();
  overridePublishDeps(undefined);
});

interface Body {
  liability_required: boolean;
  visual: { status: string; url: string | null; expires_at: string | null };
  meta: {
    connection: string;
    ad_account: { name: string | null; currency: string | null } | null;
    payment_method: string;
  };
  page: { name: string | null; active: boolean } | null;
  cities: { name: string; radius_km: number; effective_radius_km: number }[];
}
const bodyOf = async (res: Response) => (await json(res)) as unknown as Body;

describeRoute('getPublicationReadiness', {
  success: async () => {
    const { campaign } = await publishableCampaign(s);
    const res = await readiness(s, s.owner, campaign.id);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.liability_required).toBe(true);
    expect(body.visual.status).toBe('ready');
    expect(body.visual.url).toMatch(/^https?:\/\//);
    // L'adresse signée est réellement lisible dans le stockage local.
    const fetched = await fetch(body.visual.url ?? '');
    expect(fetched.status).toBe(200);
    expect(body.meta).toMatchObject({
      connection: 'ok',
      payment_method: 'present',
      ad_account: { currency: 'USD' },
    });
    expect(body.page).toMatchObject({ active: true });
  },
  unauthenticated: async () => {
    const { campaign } = await publishableCampaign(s);
    expect((await readiness(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await publishableCampaign(s);
    const stranger = await seedWorkspace();
    expect((await readiness(stranger, stranger.owner, campaign.id)).status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer »'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; inconnu : 404': async () => {
      expect((await readiness(s, s.owner, 'pas-un-uuid')).status).toBe(400);
      expect((await readiness(s, s.owner, randomUUID())).status).toBe(404);
    },
    'un lecteur voit tout, même en lecture seule de l’espace': async () => {
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
      expect((await readiness(ro, ro.viewer, campaign.id)).status).toBe(200);
    },
    'la clause n’est plus demandée après la première publication': async () => {
      const fresh = await seedWorkspace();
      const { campaign } = await publishableCampaign(fresh);
      expect(
        (await bodyOf(await readiness(fresh, fresh.owner, campaign.id))).liability_required,
      ).toBe(true);
      expect(
        (await publish(fresh, fresh.owner, campaign.id, { accept_liability: true })).status,
      ).toBe(202);
      const next = await publishableCampaign(fresh);
      expect(
        (await bodyOf(await readiness(fresh, fresh.owner, next.campaign.id))).liability_required,
      ).toBe(false);
    },
    'photo supprimée du stockage : « expired », aucune adresse': async () => {
      const { campaign, sourceId } = await publishableCampaign(s);
      const svc = testServiceClient();
      const source = await svc.from('sources').select('file_path').eq('id', sourceId).single();
      expect(
        (await svc.storage.from('sources').remove([source.data?.file_path ?? ''])).error,
      ).toBeNull();
      const body = await bodyOf(await readiness(s, s.owner, campaign.id));
      expect(body.visual).toEqual({ status: 'expired', url: null, expires_at: null });
    },
  },
});
