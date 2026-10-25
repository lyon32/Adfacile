// Refus de Meta et Modérateur (S18) contre la vraie base locale, avec la FAUSSE Meta et la FAUSSE IA (aucun appel réel) : les 5 cas de
// chaque route, EC-CAMP-07 (republication sans quota), EC-META-06 (refus partiel d'un test A/B), idempotence, interrupteur.
// La publication garde ses dépendances NORMALES (tâche `inline` + fausse Meta partagée) ; les espaces sont reliés par la VRAIE
// route de connexion (jeton chiffré). Textes et motifs D'ESSAI (le produit n'en contient aucun).
import { randomUUID } from 'node:crypto';
import {
  createExplainDeps,
  createFullMetaConnector,
  createSyncDeps,
  explainPendingRejections,
  FakeMetaConnector,
  syncCampaignStatuses,
} from '@pubeka/core';
import { getEnv } from '@pubeka/shared';
import {
  describeRoute,
  na,
  queryTestDb,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import { call } from '../meta/int-support';
import { POST as applyRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/rejections/[rejectionId]/apply-fix/route';
import { GET as getRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/rejections/[rejectionId]/route';
import { GET as listRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/rejections/route';
import { campaignParams, ensureTestFx, json, resetRateLimits } from './int-support';
import { campaignRow, JobRecorder, publishedCampaign } from './publish-support';
import { overridePublishDeps, overrideSyncJobs } from './services';

// Chaque cas publie une campagne puis lance une synchronisation de TOUTES les campagnes de la base locale : sur une base chargée, 30 s ne suffisent pas.
vi.setConfig({ testTimeout: 120_000 });

type Who = SeededWorkspace['owner'];
let s: SeededWorkspace;

beforeAll(async () => {
  s = await seedWorkspace();
  await ensureTestFx('XAF', 600);
});
beforeEach(async () => {
  await resetRateLimits();
  overridePublishDeps(undefined);
  overrideSyncJobs(undefined);
});
afterAll(() => {
  overridePublishDeps(undefined);
  overrideSyncJobs(undefined);
});

const REASON = 'Your ad wasn’t approved because it makes claims that are misleading or unrealistic.';
const svc = () => testServiceClient();

function fakeMeta(): FakeMetaConnector {
  const connector = createFullMetaConnector(getEnv(), () => new Date());
  if (!(connector instanceof FakeMetaConnector)) {
    throw new Error('PUBEKA_FAKE_PROVIDERS doit contenir « meta » : ce test n’appelle jamais le vrai Meta');
  }
  return connector;
}

async function refsOf(campaignId: string) {
  const row = await svc()
    .from('campaigns')
    .select('meta_campaign_id, meta_adset_id')
    .eq('id', campaignId)
    .single();
  const ad = await svc()
    .from('ads')
    .select('meta_ad_id, meta_creative_id')
    .eq('campaign_id', campaignId)
    .order('id')
    .limit(1)
    .single();
  expect(row.error).toBeNull();
  return {
    campaignId: row.data?.meta_campaign_id ?? '',
    adsetId: row.data?.meta_adset_id ?? null,
    adId: ad.data?.meta_ad_id ?? null,
    creativeId: ad.data?.meta_creative_id ?? null,
  };
}

const serviceCtx = () => ({ requestId: 'req_INT', svc: svc(), now: () => new Date() });

const runSync = () => syncCampaignStatuses(serviceCtx(), createSyncDeps(getEnv(), () => new Date()));
const runExplain = () => explainPendingRejections(serviceCtx(), createExplainDeps(getEnv()));

async function rejectionRows(campaignId: string) {
  const r = await svc()
    .from('rejections')
    .select('id, ad_id, explain_status, fixed_and_republished, meta_reason, report')
    .eq('campaign_id', campaignId)
    .order('created_at');
  expect(r.error).toBeNull();
  return r.data ?? [];
}

/** Campagne publiée (fausse Meta), refusée par Meta, enregistrée puis expliquée par le Modérateur (fausse IA). */
async function refusedCampaign(
  sx: SeededWorkspace,
  options: { reason?: string; copy?: Record<string, string> } = {},
) {
  const made = await publishedCampaign(sx);
  if (options.copy !== undefined) {
    const updated = await svc()
      .from('campaigns')
      .update({ copy: { cta: 'SEND_WHATSAPP_MESSAGE', ...options.copy } })
      .eq('id', made.campaign.id);
    expect(updated.error).toBeNull();
  }
  fakeMeta().simulateRejection(await refsOf(made.campaign.id), options.reason ?? REASON);
  await runSync();
  await runExplain();
  const [rejection] = await rejectionRows(made.campaign.id);
  expect(rejection).toBeDefined();
  return { ...made, rejectionId: rejection?.id ?? '' };
}

const base = (sx: SeededWorkspace, campaignId: string) =>
  `/workspaces/${sx.workspace.id}/campaigns/${campaignId}/rejections`;
const rparams = (sx: SeededWorkspace, campaignId: string, rejectionId: string) => ({
  params: Promise.resolve({ workspaceId: sx.workspace.id, campaignId, rejectionId }),
});

const list = (sx: SeededWorkspace, who: Who, campaignId: string) =>
  listRoute(call('GET', base(sx, campaignId), who.headers), campaignParams(sx.workspace.id, campaignId));
const get = (sx: SeededWorkspace, who: Who, campaignId: string, rejectionId: string) =>
  getRoute(
    call('GET', `${base(sx, campaignId)}/${rejectionId}`, who.headers),
    rparams(sx, campaignId, rejectionId),
  );
const apply = (
  sx: SeededWorkspace,
  who: Who,
  campaignId: string,
  rejectionId: string,
  key: string | null = randomUUID(),
) =>
  applyRoute(
    call(
      'POST',
      `${base(sx, campaignId)}/${rejectionId}/apply-fix`,
      { ...who.headers, ...(key === null ? {} : { 'idempotency-key': key }) },
    ),
    rparams(sx, campaignId, rejectionId),
  );

interface Problem {
  code: string;
  status: number;
  meta?: Record<string, unknown>;
}
const problemOf = async (res: Response): Promise<Problem> => (await json(res)) as unknown as Problem;

describeRoute('listRejections', {
  success: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s);
    const res = await list(s, s.owner, campaign.id);
    expect(res.status).toBe(200);
    const body = (await json(res)) as { data: { id: string; status: string; meta_reason: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([rejectionId]);
    expect(body.data[0]).toMatchObject({ status: 'ready', meta_reason: REASON });
    // Un lecteur lit aussi.
    expect((await list(s, s.viewer, campaign.id)).status).toBe(200);
  },
  unauthenticated: async () => {
    const { campaign } = await refusedCampaign(s);
    expect((await list(s, { ...s.owner, headers: {} }, campaign.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign } = await refusedCampaign(s);
    const stranger = await seedWorkspace();
    expect((await list(stranger, stranger.owner, campaign.id)).status).toBe(404);
  },
  forbiddenRole: na('lecture : tout membre, y compris un lecteur, peut lire (testé dans « succès »)'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; campagne inconnue : 404': async () => {
      expect((await list(s, s.owner, 'pas-un-uuid')).status).toBe(400);
      expect((await list(s, s.owner, randomUUID())).status).toBe(404);
    },
  },
});

describeRoute('getRejection', {
  success: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s, {
      copy: { primary_text: 'Perdez 10 kg en 7 jours, résultat garanti', headline: 'Thé minceur' },
    });
    const res = await get(s, s.owner, campaign.id, rejectionId);
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as {
      report: { fix: { field: string }; culprit: { excerpt: string } };
    };
    expect(body).toMatchObject({
      id: rejectionId,
      campaign_id: campaign.id,
      status: 'ready',
      partial: false,
      fixed: false,
      can_fix: true,
      fix_applicable: true,
    });
    expect(body.report.fix.field).toBe('primary_text');
    expect(body.report.culprit.excerpt).toContain('Perdez 10 kg');
    expect(JSON.stringify(body)).not.toContain('memory_pattern');
    expect((await get(s, s.viewer, campaign.id, rejectionId)).status).toBe(200);
  },
  unauthenticated: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s);
    expect((await get(s, { ...s.owner, headers: {} }, campaign.id, rejectionId)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s);
    const stranger = await seedWorkspace();
    expect((await get(stranger, stranger.owner, campaign.id, rejectionId)).status).toBe(404);
  },
  forbiddenRole: na('lecture : tout membre, y compris un lecteur, peut lire (testé dans « succès »)'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400 ; refus inconnu : 404': async () => {
      const { campaign } = await refusedCampaign(s);
      expect((await get(s, s.owner, campaign.id, 'pas-un-uuid')).status).toBe(400);
      expect((await get(s, s.owner, campaign.id, randomUUID())).status).toBe(404);
    },
    'un refus d’une AUTRE campagne du même espace est introuvable (404)': async () => {
      const first = await refusedCampaign(s);
      const second = await refusedCampaign(s);
      expect((await get(s, s.owner, first.campaign.id, second.rejectionId)).status).toBe(404);
    },
  },
});

describeRoute('applyRejectionFix', {
  success: async () => {
    // EC-CAMP-07 : republication sans quota, la MÊME campagne, Meta (fausse) reçoit une campagne neuve.
    const { campaign, rejectionId } = await refusedCampaign(s, {
      copy: { primary_text: 'Perdez 10 kg en 7 jours, résultat garanti', headline: 'Thé minceur' },
    });
    const before = await campaignRow(campaign.id);
    expect(before?.status).toBe('rejected');
    const oldMeta = (await refsOf(campaign.id)).campaignId;
    const adBefore = await svc().from('ads').select('id').eq('campaign_id', campaign.id).single();

    const res = await apply(s, s.owner, campaign.id, rejectionId);
    expect(res.status).toBe(202);
    const body = (await json(res)) as { id: string; status: string };
    expect(body.id).toBe(campaign.id);

    const after = await campaignRow(campaign.id);
    expect(after?.status).toBe('in_review');
    expect(after?.publish_attempt).toBe((before?.publish_attempt ?? 0) + 1);
    // Aucun quota décompté ni retenu pour cette republication.
    expect(after?.quota_state).toBe(before?.quota_state);
    const copy = await svc().from('campaigns').select('copy').eq('id', campaign.id).single();
    expect((copy.data?.copy as { primary_text: string }).primary_text).toContain('Découvrez nos produits');
    expect((copy.data?.copy as { headline: string }).headline).toBe('Thé minceur');
    // Le refus est marqué corrigé ; l'ancienne campagne refusée est retirée de chez Meta, une neuve a pris sa place.
    expect((await rejectionRows(campaign.id))[0]?.fixed_and_republished).toBe(true);
    expect(fakeMeta().campaigns.get(oldMeta)?.deleted).toBe(true);
    expect((await refsOf(campaign.id)).campaignId).not.toBe(oldMeta);
    const ads = await svc().from('ads').select('id').eq('campaign_id', campaign.id);
    expect(ads.data).toHaveLength(1);
    // La ligne de publicité est RÉUTILISÉE (les statistiques par publicité lui sont rattachées en CASCADE).
    expect(ads.data?.[0]?.id).toBe(adBefore.data?.id);
  },
  unauthenticated: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s);
    expect((await apply(s, { ...s.owner, headers: {} }, campaign.id, rejectionId)).status).toBe(401);
    expect((await campaignRow(campaign.id))?.status).toBe('rejected');
  },
  otherWorkspace: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s);
    const stranger = await seedWorkspace();
    expect((await apply(stranger, stranger.owner, campaign.id, rejectionId)).status).toBe(404);
    expect((await campaignRow(campaign.id))?.status).toBe('rejected');
  },
  forbiddenRole: async () => {
    const { campaign, rejectionId } = await refusedCampaign(s);
    const res = await apply(s, s.viewer, campaign.id, rejectionId);
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
    expect((await campaignRow(campaign.id))?.status).toBe('rejected');
  },
  invalidBody: async () => {
    // Aucun corps, mais la clé d'idempotence est obligatoire et doit être un UUID ; les identifiants aussi.
    const { campaign, rejectionId } = await refusedCampaign(s);
    expect((await apply(s, s.owner, campaign.id, rejectionId, null)).status).toBe(400);
    expect((await apply(s, s.owner, campaign.id, rejectionId, 'pas-un-uuid')).status).toBe(400);
    expect((await apply(s, s.owner, 'pas-un-uuid', rejectionId)).status).toBe(400);
    expect((await apply(s, s.owner, campaign.id, 'pas-un-uuid')).status).toBe(400);
    expect((await campaignRow(campaign.id))?.status).toBe('rejected');
  },
  extra: {
    'EC-CAMP-01 : la même Idempotency-Key rejouée ne republie pas une deuxième fois': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s);
      const key = randomUUID();
      expect((await apply(s, s.owner, campaign.id, rejectionId, key)).status).toBe(202);
      const attempts = (await campaignRow(campaign.id))?.publish_attempt;
      const again = await apply(s, s.owner, campaign.id, rejectionId, key);
      expect(again.status).toBe(202);
      expect((await campaignRow(campaign.id))?.publish_attempt).toBe(attempts);
      expect(fakeMeta().createAttempts).toBeGreaterThan(0);
    },
    'deux clics simultanés avec deux clés : une seule republication (409 pour l’autre)': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s);
      const results = await Promise.all([
        apply(s, s.owner, campaign.id, rejectionId),
        apply(s, s.owner, campaign.id, rejectionId),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([202, 409]);
      expect((await campaignRow(campaign.id))?.publish_attempt).toBeGreaterThan(0);
    },
    'interrupteur de publication réelle éteint : 503, rien n’est modifié': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s);
      const recorder = new JobRecorder();
      recorder.publishEnabled = false;
      overridePublishDeps(recorder.deps());
      const res = await apply(s, s.owner, campaign.id, rejectionId);
      expect(res.status).toBe(503);
      const problem = await problemOf(res);
      expect(problem.code).toBe('provider_unavailable');
      expect(problem.meta).toMatchObject({ reason: 'publish_disabled' });
      expect(recorder.jobs).toHaveLength(0);
      expect((await campaignRow(campaign.id))?.status).toBe('rejected');
      expect((await rejectionRows(campaign.id))[0]?.fixed_and_republished).toBe(false);
    },
    'B1 : ancienne campagne redevenue active chez Meta (appel gagné) : 409 no_longer_rejected, rien n’est créé ni supprimé': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s);
      const refs = await refsOf(campaign.id);
      const fake = fakeMeta();
      fake.simulateRemoteStatus(refs, { status: 'active', rawStatus: 'ACTIVE' });
      const created = fake.createAttempts;
      try {
        const res = await apply(s, s.owner, campaign.id, rejectionId);
        expect(res.status).toBe(409);
        expect((await problemOf(res)).meta).toMatchObject({ reason: 'no_longer_rejected' });
        expect(fake.createAttempts).toBe(created);
        expect(fake.campaigns.get(refs.campaignId)?.deleted).toBe(false);
        expect((await campaignRow(campaign.id))?.status).toBe('rejected');
        expect((await rejectionRows(campaign.id))[0]?.fixed_and_republished).toBe(false);
      } finally {
        fake.simulateRemoteStatus(refs, undefined);
      }
    },
    'A2 : la clé de la publication d’origine ne republie rien (409 idempotency_key_reused)': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s);
      const row = await svc()
        .from('campaigns')
        .select('publish_idempotency_key')
        .eq('id', campaign.id)
        .single();
      const res = await apply(s, s.owner, campaign.id, rejectionId, row.data?.publish_idempotency_key);
      expect(res.status).toBe(409);
      expect((await problemOf(res)).code).toBe('idempotency_key_reused');
      expect((await campaignRow(campaign.id))?.status).toBe('rejected');
      expect((await rejectionRows(campaign.id))[0]?.fixed_and_republished).toBe(false);
    },
    'lecture seule : 403 workspace_read_only': async () => {
      const ro = await seedWorkspace();
      const { campaign, rejectionId } = await refusedCampaign(ro);
      const updated = await svc().from('workspaces').update({ status: 'read_only' }).eq('id', ro.workspace.id);
      expect(updated.error).toBeNull();
      const res = await apply(ro, ro.owner, campaign.id, rejectionId);
      expect(res.status).toBe(403);
      expect((await problemOf(res)).code).toBe('workspace_read_only');
    },
    'produit interdit par Meta : 409 fix_not_applicable, aucun bouton, rien ne repart': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s, {
        reason: 'Your ad wasn’t approved because it promotes tobacco or related products.',
      });
      const view = (await json(await get(s, s.owner, campaign.id, rejectionId)));
      expect(view).toMatchObject({ can_fix: false, fix_applicable: false });
      const res = await apply(s, s.owner, campaign.id, rejectionId);
      expect(res.status).toBe(409);
      expect((await problemOf(res)).meta).toMatchObject({ reason: 'fix_not_applicable', cause: 'product_not_allowed' });
      expect((await campaignRow(campaign.id))?.status).toBe('rejected');
    },
    'refus déjà corrigé : 409 already_fixed': async () => {
      const { campaign, rejectionId } = await refusedCampaign(s);
      expect((await apply(s, s.owner, campaign.id, rejectionId)).status).toBe(202);
      const res = await apply(s, s.owner, campaign.id, rejectionId);
      expect(res.status).toBe(409);
    },
    'EC-META-06 : refus PARTIEL d’un test A/B — la campagne continue, le Modérateur ne traite que la pub refusée': async () => {
      const ab = await seedWorkspace();
      const made = await publishedCampaign(ab);
      await queryTestDb(
        `set session_replication_role = replica; update public.campaigns set status='active' where id='${made.campaign.id}'; set session_replication_role = origin;`,
      );
      const refs = await refsOf(made.campaign.id);
      // Une 2e publicité (variante B) : la publication d'un test A/B arrive avec l'étape Visuel (S23), on la sème ici.
      const first = await svc().from('ads').update({ variant: 'A' }).eq('campaign_id', made.campaign.id).select('id');
      expect(first.error).toBeNull();
      const second = await svc()
        .from('ads')
        .insert({
          workspace_id: ab.workspace.id,
          campaign_id: made.campaign.id,
          meta_ad_id: String(Math.floor(1e14 + Math.random() * 9e14)),
          format: '4:5',
          status: 'active',
          variant: 'B',
        })
        .select('id')
        .single();
      expect(second.error).toBeNull();

      // Meta : la publicité A est refusée, B continue. (La fausse Meta ne connaît qu'une publicité : on lit A par son identifiant.)
      const fake = fakeMeta();
      fake.simulateApproval(refs);
      const original = fake.fetchRejection.bind(fake);
      fake.fetchRejection = (token, r) =>
        r.adId === refs.adId
          ? Promise.resolve({ reason: REASON, adId: r.adId })
          : original(token, r);
      try {
        const report = await runSync();
        expect(report.rejections).toBeGreaterThanOrEqual(1);
        await runExplain();
      } finally {
        fake.fetchRejection = original;
      }

      expect((await campaignRow(made.campaign.id))?.status).toBe('active');
      const rows = await rejectionRows(made.campaign.id);
      expect(rows).toHaveLength(1);
      const [rejection] = rows;
      const adA = await svc().from('ads').select('id').eq('campaign_id', made.campaign.id).eq('variant', 'A').single();
      expect(rejection?.ad_id).toBe(adA.data?.id);
      expect(rejection?.explain_status).toBe('ready');
      const ads = await svc().from('ads').select('variant, status').eq('campaign_id', made.campaign.id).order('variant');
      expect(ads.data).toEqual([
        { variant: 'A', status: 'rejected' },
        { variant: 'B', status: 'active' },
      ]);

      const view = (await json(await get(ab, ab.owner, made.campaign.id, rejection?.id ?? '')));
      expect(view).toMatchObject({ partial: true, variant: 'A', fix_applicable: false });
      const res = await apply(ab, ab.owner, made.campaign.id, rejection?.id ?? '');
      expect(res.status).toBe(409);
      expect((await problemOf(res)).meta).toMatchObject({ reason: 'partial_rejection' });
      expect((await campaignRow(made.campaign.id))?.status).toBe('active');
    },
  },
});
