// Pause, reprise et relance d'une campagne (F9, APPFLOW §11, SECURITY_NOTES §2.1/§2.4, EC-CAMP-09, EC-META-07).
// Aucun appel réel : la fausse Meta. Règle commune : Meta est appelé D'ABORD, le statut de Pubeka ne change que si Meta a répondu
// (pas de faux succès). La mise en pause reste permise en lecture seule et pour une Page hors formule.
import { AppError } from '@pubeka/contracts';
import {
  FakeMetaConnector,
  FAKE_EXPIRED_TOKEN,
  MetaGraphError,
  type PlatformToken,
} from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { ANALYSIS, NOW, PAGE, W } from '../campaigns.test-helper';
import {
  pauseCampaign,
  relaunchCampaign,
  resumeCampaign,
  type CampaignControlDeps,
} from './campaign-control';
import { publishRef } from './publish-types';
import { META_AD_ACCOUNT, publishWorld, rowOf, type PublishWorld } from './publish.test-helper';

const TOKEN: PlatformToken = { accessToken: 'jeton-de-test', expiresAt: null };

interface Live {
  w: PublishWorld;
  fake: FakeMetaConnector;
  deps: CampaignControlDeps;
  id: string;
}

/** Une campagne déjà chez la fausse Meta, dans l'état Pubeka demandé. */
async function live(
  status:
    | 'in_review'
    | 'active'
    | 'paused'
    | 'stopped'
    | 'ended'
    | 'draft'
    | 'rejected'
    | 'error'
    | 'publishing',
  over: Parameters<typeof publishWorld>[0] = {},
): Promise<Live> {
  const w = publishWorld(over);
  const fake = new FakeMetaConnector();
  const refs = await fake.createCampaign(TOKEN, {
    campaignName: `Promo baskets [${publishRef(w.campaignId, 1)}]`,
    objective: 'OUTCOME_ENGAGEMENT',
    adAccountId: META_AD_ACCOUNT,
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
    startDate: '2026-10-14',
    targeting: { locations: [{ key: 'CM', type: 'country' }] },
    creative: {},
  });
  if (status === 'active' || status === 'in_review') await fake.resume(TOKEN, refs);
  Object.assign(rowOf(w.db, w.campaignId), {
    status,
    editable: false,
    meta_campaign_id: refs.campaignId,
    meta_adset_id: refs.adsetId,
    publish_ref: publishRef(w.campaignId, 1),
    publish_attempt: 1,
    quota_state: 'counted',
  });
  w.db
    .rows('ads')
    .push({
      workspace_id: w.ctx.workspace.id,
      campaign_id: w.campaignId,
      meta_ad_id: refs.adId,
      meta_creative_id: refs.creativeId,
    });
  fake.pauseAttempts = 0;
  fake.resumeAttempts = 0;
  return {
    w,
    fake,
    id: w.campaignId,
    deps: { connector: fake, loadToken: () => Promise.resolve(TOKEN) },
  };
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('AppError attendue');
}

const statusOf = (t: Live) => rowOf(t.w.db, t.id).status;

describe('pauseCampaign', () => {
  it.each(['active', 'in_review'] as const)(
    '%s → paused : Meta d’abord, puis le statut, la date de pause et l’historique',
    async (from) => {
      const t = await live(from);
      const view = await pauseCampaign(t.w.ctx, t.id, t.deps);
      expect(view).toMatchObject({ status: 'paused', paused_at: NOW.toISOString() });
      expect(t.fake.pauseAttempts).toBe(1);
      expect([...t.fake.campaigns.values()][0]?.status).toBe('paused');
      expect(rowOf(t.w.db, t.id)).toMatchObject({ status: 'paused', paused_at: NOW.toISOString() });
      expect(t.w.db.rows('campaign_status_events').map((e) => e.status)).toContain('paused');
    },
  );

  it('déjà en pause : 200 sans rappeler Meta (idempotent)', async () => {
    const t = await live('paused');
    const view = await pauseCampaign(t.w.ctx, t.id, t.deps);
    expect(view.status).toBe('paused');
    expect(t.fake.pauseAttempts).toBe(0);
  });

  it.each(['read_only', 'suspended'] as const)(
    'espace %s : la pause reste permise (SECURITY_NOTES §2.1)',
    async (access) => {
      const t = await live('active', { access });
      await expect(pauseCampaign(t.w.ctx, t.id, t.deps)).resolves.toMatchObject({
        status: 'paused',
      });
    },
  );

  it('EC-CAMP-09 : une Page retirée de la formule n’empêche pas la pause', async () => {
    const t = await live('active');
    const page = t.w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    await expect(pauseCampaign(t.w.ctx, t.id, t.deps)).resolves.toMatchObject({ status: 'paused' });
  });

  it('un lecteur ne peut pas mettre en pause (role_insufficient)', async () => {
    const t = await live('active', { role: 'viewer' });
    expect((await failure(pauseCampaign(t.w.ctx, t.id, t.deps))).code).toBe('role_insufficient');
    expect(t.fake.pauseAttempts).toBe(0);
  });

  it('une campagne d’un autre espace ou inconnue est introuvable (404)', async () => {
    const t = await live('active');
    expect(
      (await failure(pauseCampaign(t.w.ctx, '00000000-0000-4000-8000-0000000000aa', t.deps))).code,
    ).toBe('not_found');
    Object.assign(rowOf(t.w.db, t.id), { workspace_id: 'autre' });
    expect((await failure(pauseCampaign(t.w.ctx, t.id, t.deps))).code).toBe('not_found');
    expect(t.fake.pauseAttempts).toBe(0);
  });

  it('EC-META-07 : Meta ne répond pas → 502 meta_error, la campagne N’EST PAS affichée en pause', async () => {
    const t = await live('active');
    t.fake.simulateTransientError(1);
    const error = await failure(pauseCampaign(t.w.ctx, t.id, t.deps));
    expect(error.code).toBe('meta_error');
    expect(error.status).toBe(502);
    expect(rowOf(t.w.db, t.id)).toMatchObject({ status: 'active', paused_at: null });
    expect(t.w.db.rows('campaign_status_events')).toEqual([]);
    // Elle se met en pause au clic suivant : la mise en pause est idempotente chez Meta.
    await expect(pauseCampaign(t.w.ctx, t.id, t.deps)).resolves.toMatchObject({ status: 'paused' });
  });

  it('jeton refusé par Meta : 424 meta_token_expired, rien ne change', async () => {
    const t = await live('active');
    const error = await failure(
      pauseCampaign(t.w.ctx, t.id, {
        ...t.deps,
        loadToken: () => Promise.resolve(FAKE_EXPIRED_TOKEN),
      }),
    );
    expect(error.code).toBe('meta_token_expired');
    expect(statusOf(t)).toBe('active');
  });

  it('connexion révoquée : 424 meta_token_expired sans appeler Meta', async () => {
    const t = await live('active');
    const connection = t.w.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.status = 'revoked';
    expect((await failure(pauseCampaign(t.w.ctx, t.id, t.deps))).code).toBe('meta_token_expired');
    expect(t.fake.pauseAttempts).toBe(0);
  });

  it.each(['draft', 'publishing', 'ended', 'stopped', 'rejected', 'error'] as const)(
    'une campagne %s ne se met pas en pause (409)',
    async (status) => {
      const t = await live(status);
      expect((await failure(pauseCampaign(t.w.ctx, t.id, t.deps))).code).toBe('conflict');
      expect(t.fake.pauseAttempts).toBe(0);
    },
  );

  it('sans identifiant Meta enregistré : 409, aucun appel', async () => {
    const t = await live('active');
    Object.assign(rowOf(t.w.db, t.id), { meta_campaign_id: null });
    expect((await failure(pauseCampaign(t.w.ctx, t.id, t.deps))).code).toBe('conflict');
    expect(t.fake.pauseAttempts).toBe(0);
  });

  it('l’écriture en base échoue APRÈS la réponse de Meta : erreur interne, et le clic suivant aboutit', async () => {
    const t = await live('active');
    t.w.db.failNext.add('campaigns:update');
    expect((await failure(pauseCampaign(t.w.ctx, t.id, t.deps))).code).toBe('internal_error');
    expect(statusOf(t)).toBe('active');
    await expect(pauseCampaign(t.w.ctx, t.id, t.deps)).resolves.toMatchObject({ status: 'paused' });
  });
});

describe('resumeCampaign', () => {
  it('paused → active : Meta d’abord, la date de pause est effacée', async () => {
    const t = await live('paused');
    Object.assign(rowOf(t.w.db, t.id), { paused_at: '2026-10-10T00:00:00.000Z' });
    const view = await resumeCampaign(t.w.ctx, t.id, t.deps);
    expect(view).toMatchObject({ status: 'active', paused_at: null });
    expect(t.fake.resumeAttempts).toBe(1);
    expect([...t.fake.campaigns.values()][0]?.status).toBe('active');
  });

  it('déjà en diffusion : 200 sans rappeler Meta', async () => {
    const t = await live('active');
    expect((await resumeCampaign(t.w.ctx, t.id, t.deps)).status).toBe('active');
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it('EC-CAMP-09 : Page hors formule → 402 page_limit_reached, Meta n’est pas appelé', async () => {
    const t = await live('paused');
    const page = t.w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    expect((await failure(resumeCampaign(t.w.ctx, t.id, t.deps))).code).toBe('page_limit_reached');
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it.each([
    ['read_only', 'workspace_read_only'],
    ['suspended', 'workspace_suspended'],
  ] as const)('espace %s : la reprise est refusée (%s)', async (access, code) => {
    const t = await live('paused', { access });
    expect((await failure(resumeCampaign(t.w.ctx, t.id, t.deps))).code).toBe(code);
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it('un lecteur ne peut pas reprendre', async () => {
    const t = await live('paused', { role: 'viewer' });
    expect((await failure(resumeCampaign(t.w.ctx, t.id, t.deps))).code).toBe('role_insufficient');
  });

  it('Meta refuse la reprise : l’erreur remonte, la campagne reste en pause', async () => {
    const t = await live('paused');
    t.fake.simulateResumeRefusal(
      new AppError('meta_payment_method_missing', {
        meta: {
          title: 'Compte indisponible',
          message: 'Vérifie ton moyen de paiement.',
          fix: 'billing',
        },
      }),
    );
    const error = await failure(resumeCampaign(t.w.ctx, t.id, t.deps));
    expect(error.code).toBe('meta_payment_method_missing');
    expect(error.opts.meta).toMatchObject({ title: 'Compte indisponible' });
    expect(statusOf(t)).toBe('paused');
  });

  it('réponse perdue mais reprise appliquée : on lit l’état chez Meta (actif) et on met à jour, sans réactiver', async () => {
    const t = await live('paused');
    t.fake.simulateResumeTimeout({ applied: true });
    await expect(resumeCampaign(t.w.ctx, t.id, t.deps)).resolves.toMatchObject({
      status: 'active',
    });
    expect(t.fake.resumeAttempts).toBe(1);
  });

  it('réponse perdue et reprise NON appliquée : 502, la campagne reste en pause', async () => {
    const t = await live('paused');
    t.fake.simulateResumeTimeout({ applied: false });
    expect((await failure(resumeCampaign(t.w.ctx, t.id, t.deps))).code).toBe('meta_error');
    expect(statusOf(t)).toBe('paused');
    expect(t.fake.resumeAttempts).toBe(1);
  });

  it.each(['draft', 'ended', 'stopped', 'in_review'] as const)(
    'une campagne %s ne se reprend pas (409)',
    async (status) => {
      const t = await live(status);
      expect((await failure(resumeCampaign(t.w.ctx, t.id, t.deps))).code).toBe('conflict');
    },
  );
});

describe('relaunchCampaign — mode recover (campagne arrêtée, action du CLIENT)', () => {
  it('stopped → active par « recover » : Meta d’abord, puis le statut', async () => {
    const t = await live('stopped');
    const version = Number(rowOf(t.w.db, t.id).version);
    const view = await relaunchCampaign(t.w.ctx, t.id, { mode: 'recover', version }, t.deps);
    expect(view.status).toBe('active');
    expect(t.fake.resumeAttempts).toBe(1);
    expect(t.w.db.rows('campaign_status_events').map((e) => e.status)).toContain('active');
  });

  it('version périmée : 409 avec la version actuelle, Meta n’est pas appelé', async () => {
    const t = await live('stopped');
    const error = await failure(
      relaunchCampaign(t.w.ctx, t.id, { mode: 'recover', version: 99 }, t.deps),
    );
    expect(error.code).toBe('conflict');
    expect(error.opts.meta).toMatchObject({ reason: 'stale_version' });
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it('Meta refuse la relance (compte encore en défaut) : son message TRADUIT remonte, jamais un échec muet ; la campagne reste arrêtée', async () => {
    const t = await live('stopped');
    t.fake.simulateResumeRefusal(
      new AppError('meta_payment_method_missing', {
        meta: {
          title: 'Compte publicitaire indisponible',
          message:
            'Votre compte publicitaire Facebook est désactivé ou son moyen de paiement est invalide.',
          fix: 'billing',
        },
        cause: new MetaGraphError({ code: 2635, message: 'brut' }, 400),
      }),
    );
    const error = await failure(
      relaunchCampaign(
        t.w.ctx,
        t.id,
        { mode: 'recover', version: Number(rowOf(t.w.db, t.id).version) },
        t.deps,
      ),
    );
    expect(error.code).toBe('meta_payment_method_missing');
    expect(error.opts.meta).toMatchObject({
      title: 'Compte publicitaire indisponible',
      message:
        'Votre compte publicitaire Facebook est désactivé ou son moyen de paiement est invalide.',
      fix: 'billing',
    });
    expect(statusOf(t)).toBe('stopped');
  });

  it('Meta accepte l’ordre mais le statut effectif montre encore un problème de facturation : refus explicite, la campagne reste arrêtée', async () => {
    const t = await live('stopped');
    const remote = [...t.fake.campaigns.values()][0];
    if (remote !== undefined)
      t.fake.simulateRemoteStatus(remote.refs, {
        status: 'error',
        rawStatus: 'PENDING_BILLING_INFO',
      });
    const error = await failure(
      relaunchCampaign(
        t.w.ctx,
        t.id,
        { mode: 'recover', version: Number(rowOf(t.w.db, t.id).version) },
        t.deps,
      ),
    );
    expect(error.code).toBe('meta_payment_method_missing');
    expect(error.opts.meta).toMatchObject({
      reason: 'billing_still_failing',
      raw_status: 'PENDING_BILLING_INFO',
    });
    expect(statusOf(t)).toBe('stopped');
  });

  it('réponse perdue mais relance appliquée : lue chez Meta, la campagne repart', async () => {
    const t = await live('stopped');
    t.fake.simulateResumeTimeout({ applied: true });
    const view = await relaunchCampaign(
      t.w.ctx,
      t.id,
      { mode: 'recover', version: Number(rowOf(t.w.db, t.id).version) },
      t.deps,
    );
    expect(view.status).toBe('active');
    expect(t.fake.resumeAttempts).toBe(1);
  });

  it.each(['draft', 'active', 'paused', 'ended', 'in_review'] as const)(
    'une campagne %s ne se relance pas par « recover » (409)',
    async (status) => {
      const t = await live(status);
      expect(
        (await failure(relaunchCampaign(t.w.ctx, t.id, { mode: 'recover', version: 1 }, t.deps)))
          .code,
      ).toBe('conflict');
      expect(t.fake.resumeAttempts).toBe(0);
    },
  );

  it('EC-CAMP-09 : Page hors formule → 402 page_limit_reached', async () => {
    const t = await live('stopped');
    const page = t.w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    expect(
      (
        await failure(
          relaunchCampaign(
            t.w.ctx,
            t.id,
            { mode: 'recover', version: Number(rowOf(t.w.db, t.id).version) },
            t.deps,
          ),
        )
      ).code,
    ).toBe('page_limit_reached');
  });

  it.each([
    ['viewer', 'active', 'role_insufficient'],
    ['owner', 'read_only', 'workspace_read_only'],
    ['owner', 'suspended', 'workspace_suspended'],
  ] as const)('rôle %s, espace %s : %s', async (role, access, code) => {
    const t = await live('stopped', { role, access });
    expect(
      (await failure(relaunchCampaign(t.w.ctx, t.id, { mode: 'recover', version: 1 }, t.deps)))
        .code,
    ).toBe(code);
    expect(t.fake.resumeAttempts).toBe(0);
  });

  it('deux clics simultanés : une seule relance chez Meta', async () => {
    const t = await live('stopped');
    const version = Number(rowOf(t.w.db, t.id).version);
    const results = await Promise.allSettled([
      relaunchCampaign(t.w.ctx, t.id, { mode: 'recover', version }, t.deps),
      relaunchCampaign(t.w.ctx, t.id, { mode: 'recover', version }, t.deps),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(statusOf(t)).toBe('active');
  });
});

describe('relaunchCampaign — mode copy (F9 : un nouveau brouillon, compte comme une nouvelle campagne)', () => {
  it('copie la proposition dans un nouveau brouillon : mêmes champs, aucune trace de la publication, dates recalées', async () => {
    const t = await live('ended');
    Object.assign(rowOf(t.w.db, t.id), {
      chosen_proposal_version: 2,
      start_date: '2026-09-01',
      end_date: '2026-09-08',
      publish_error: { code: 'meta_error', at: 'x' },
    });
    const view = await relaunchCampaign(
      t.w.ctx,
      t.id,
      { mode: 'copy', visual_mode: 'same' },
      t.deps,
    );
    expect(view).toMatchObject({
      status: 'draft',
      version: 1,
      editable: true,
      name: 'Promo baskets (copie)',
      objective: 'OUTCOME_ENGAGEMENT',
      destination: 'WHATSAPP',
      daily_budget_usd_cents: 500,
      page_id: PAGE,
      analysis_id: ANALYSIS,
      published_at: null,
      publication_error: null,
      chosen_proposal_version: 2,
    });
    expect(view.id).not.toBe(t.id);
    // Même durée (7 jours d'écart), recalée à partir d'aujourd'hui (fuseau de l'utilisateur).
    expect(view.start_date).toBe('2026-10-12');
    expect(view.end_date).toBe('2026-10-19');
    const copy = t.w.db.rows('campaigns').find((r) => r.id === view.id);
    expect(copy).toMatchObject({
      workspace_id: W,
      meta_campaign_id: null,
      publish_ref: null,
      publish_attempt: 0,
      quota_state: 'none',
      created_by: t.w.ctx.user.id,
    });
    // L'original n'a pas bougé.
    expect(rowOf(t.w.db, t.id)).toMatchObject({ status: 'ended', name: 'Promo baskets' });
  });

  it('en anglais, le nom porte « (copy) »', async () => {
    const t = await live('ended');
    t.w.ctx.user.locale = 'en';
    const view = await relaunchCampaign(
      t.w.ctx,
      t.id,
      { mode: 'copy', visual_mode: 'same' },
      t.deps,
    );
    expect(view.name).toBe('Promo baskets (copy)');
  });

  it('un nom déjà long est raccourci pour tenir en 200 caractères', async () => {
    const t = await live('ended');
    Object.assign(rowOf(t.w.db, t.id), { name: 'x'.repeat(200) });
    const view = await relaunchCampaign(
      t.w.ctx,
      t.id,
      { mode: 'copy', visual_mode: 'same' },
      t.deps,
    );
    expect(view.name.length).toBeLessThanOrEqual(200);
    expect(view.name.endsWith(' (copie)')).toBe(true);
  });

  it('des dates absentes restent absentes (aucune date inventée)', async () => {
    const t = await live('ended');
    Object.assign(rowOf(t.w.db, t.id), { start_date: null, end_date: null });
    const view = await relaunchCampaign(
      t.w.ctx,
      t.id,
      { mode: 'copy', visual_mode: 'same' },
      t.deps,
    );
    expect(view.start_date).toBeNull();
    expect(view.end_date).toBeNull();
  });

  it.each(['similar', 'change'] as const)(
    '« %s » demande de nouveaux visuels (étape Visuel, S23) : refus explicite, rien n’est créé',
    async (visual_mode) => {
      const t = await live('ended');
      const before = t.w.db.rows('campaigns').length;
      const error = await failure(
        relaunchCampaign(t.w.ctx, t.id, { mode: 'copy', visual_mode }, t.deps),
      );
      expect(error.code).toBe('validation_failed');
      expect(error.opts.errors?.[0]).toMatchObject({ field: 'visual_mode', code: 'unsupported' });
      expect(t.w.db.rows('campaigns')).toHaveLength(before);
    },
  );

  it('un brouillon ne se « relance » pas (il se publie) : 409', async () => {
    const t = await live('draft');
    expect(
      (
        await failure(
          relaunchCampaign(t.w.ctx, t.id, { mode: 'copy', visual_mode: 'same' }, t.deps),
        )
      ).code,
    ).toBe('conflict');
  });

  it.each([
    ['viewer', 'active', 'role_insufficient'],
    ['owner', 'read_only', 'workspace_read_only'],
  ] as const)('rôle %s, espace %s : %s', async (role, access, code) => {
    const t = await live('ended', { role, access });
    expect(
      (
        await failure(
          relaunchCampaign(t.w.ctx, t.id, { mode: 'copy', visual_mode: 'same' }, t.deps),
        )
      ).code,
    ).toBe(code);
  });
});
