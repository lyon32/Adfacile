// Route + tâche de bout en bout sur la vraie base locale, avec la FAUSSE Meta et le lanceur `inline` (aucune dépense, aucun appel
// réel) : le clic sur Publier passe la campagne en publication, la tâche crée chez la fausse Meta, active, et la campagne arrive
// en « envoyée à Meta ». C'est le parcours P2 côté serveur (le parcours d'écran vient en 9/9).
import { randomUUID } from 'node:crypto';
import {
  queryTestDb,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetRateLimits } from './int-support';
import { campaignRow, json, publish, publishableCampaign } from './publish-support';
import { overridePublishDeps } from './services';

let s: SeededWorkspace;
beforeAll(async () => {
  s = await seedWorkspace();
});
beforeEach(async () => {
  await resetRateLimits();
  overridePublishDeps(undefined);
});

describe('publication de bout en bout (fausse Meta, tâche inline)', () => {
  it('Publier → tâche → la campagne est chez la fausse Meta, enregistrée, en vérification', async () => {
    const { campaign } = await publishableCampaign(s, { connected: true });
    const res = await publish(s, s.owner, campaign.id, { accept_liability: true });
    expect(res.status).toBe(202);
    expect(((await json(res)) as unknown as { status: string }).status).toBe('publishing');

    const row = await campaignRow(campaign.id);
    expect(row).toMatchObject({ status: 'in_review', publish_phase: 'done', editable: false });
    const svc = testServiceClient();
    const full = await svc
      .from('campaigns')
      .select('meta_campaign_id, meta_adset_id, published_at, publish_error')
      .eq('id', campaign.id)
      .single();
    expect(full.data?.meta_campaign_id).toMatch(/^[0-9]{5,25}$/);
    expect(full.data?.meta_adset_id).toMatch(/^[0-9]{5,25}$/);
    expect(full.data?.published_at).not.toBeNull();
    expect(full.data?.publish_error).toBeNull();
    const ads = await svc.from('ads').select('meta_ad_id').eq('campaign_id', campaign.id);
    expect(ads.data).toHaveLength(1);
    const events = await svc
      .from('campaign_status_events')
      .select('status')
      .eq('campaign_id', campaign.id)
      .order('id', { ascending: true });
    expect((events.data ?? []).map((e) => e.status)).toEqual(['publishing', 'in_review']);
  });

  it('rejouer la même clé ne publie pas une deuxième fois', async () => {
    const { campaign } = await publishableCampaign(s, { connected: true });
    const key = randomUUID();
    expect((await publish(s, s.owner, campaign.id, { accept_liability: true }, key)).status).toBe(
      202,
    );
    const before = await queryTestDb(
      `select meta_campaign_id from public.campaigns where id='${campaign.id}'`,
    );
    const replay = await publish(s, s.owner, campaign.id, { accept_liability: true }, key);
    expect(replay.status).toBe(202);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    const after = await queryTestDb(
      `select meta_campaign_id from public.campaigns where id='${campaign.id}'`,
    );
    expect(after).toEqual(before);
  });

  it('une autre clé sur une campagne déjà chez Meta : 409 already_published, rien de recréé', async () => {
    const { campaign } = await publishableCampaign(s, { connected: true });
    expect((await publish(s, s.owner, campaign.id)).status).toBe(202);
    const again = await publish(s, s.owner, campaign.id);
    expect(again.status).toBe(409);
    expect(((await json(again)) as unknown as { code: string }).code).toBe('already_published');
  });
});
