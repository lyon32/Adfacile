// Tâche `campaign.publish` avec la FAUSSE Meta (aucun appel réel, jamais) : succès, refus clairs, et les six cas de résultat
// incertain d'EC-META-05 (succès, refus clair, délai avec création réussie, délai sans création, double clic, rejeu de la même clé).
// La preuve centrale : `createAttempts` ne dépasse JAMAIS 1 — une création incertaine n'est jamais rejouée.
import { AppError } from '@pubeka/contracts';
import {
  FakeMetaConnector,
  FAKE_EXPIRED_TOKEN,
  MetaGraphError,
  type PlatformToken,
} from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import type { ServiceCtx } from '../../context';
import { NOW, PAGE, W } from '../campaigns.test-helper';
import { publishCampaign } from './publish-campaign';
import { publishRef, publishRefBase } from './publish-types';
import {
  runPublication,
  type PublishConnector,
  type PublicationOutcome,
  type RunPublicationDeps,
} from './run-publication';
import {
  KEY_A,
  META_AD_ACCOUNT,
  PHOTO_PATH,
  publishWorld,
  rowOf,
  type PublishWorld,
} from './publish.test-helper';

const SECRET = 'SECRET-TOKEN-NE-DOIT-JAMAIS-SORTIR';
const TOKEN: PlatformToken = { accessToken: SECRET, expiresAt: null };

interface Run {
  w: PublishWorld;
  fake: FakeMetaConnector;
  svcCtx: ServiceCtx;
  run: (overrides?: Partial<RunPublicationDeps>) => Promise<PublicationOutcome>;
  deps: (overrides?: Partial<RunPublicationDeps>) => RunPublicationDeps;
}

/** Une campagne déjà passée en « publication » par la route, prête pour la tâche. */
async function published(
  over: Parameters<typeof publishWorld>[0] = {},
  fake = new FakeMetaConnector(),
): Promise<Run> {
  const w = publishWorld(over);
  await publishCampaign(
    w.ctx,
    w.campaignId,
    { idempotencyKey: KEY_A, acceptLiability: true },
    w.deps,
  );
  const svcCtx: ServiceCtx = { requestId: 'req_TASK', svc: w.db.asService(), now: () => NOW };
  const deps = (overrides: Partial<RunPublicationDeps> = {}): RunPublicationDeps => ({
    connector: fake,
    loadToken: () => Promise.resolve(TOKEN),
    metaPublishEnabled: () => true,
    beforeSpend: w.hooks.beforeSpend,
    afterAccepted: w.hooks.afterAccepted,
    release: w.hooks.release,
    ...overrides,
  });
  return {
    w,
    fake,
    svcCtx,
    deps,
    run: (overrides) =>
      runPublication(svcCtx, { campaignId: w.campaignId, workspaceId: W }, deps(overrides)),
  };
}

/** La fausse Meta, dont certaines méthodes sont remplacées ; les autres lui restent liées (ses compteurs restent les siens). */
function wrap(fake: FakeMetaConnector, overrides: Partial<PublishConnector>): PublishConnector {
  return {
    createCampaign: fake.createCampaign.bind(fake),
    resume: fake.resume.bind(fake),
    deleteCampaign: fake.deleteCampaign.bind(fake),
    getStatus: fake.getStatus.bind(fake),
    findCampaignsByReference: fake.findCampaignsByReference.bind(fake),
    searchLocations: fake.searchLocations.bind(fake),
    ...overrides,
  };
}

describe('runPublication — succès', () => {
  it('crée en pause, enregistre les identifiants, active, passe en in_review, décompte le quota et fige la Page', async () => {
    const t = await published();
    const outcome = await t.run();
    expect(outcome).toEqual({ outcome: 'accepted', adopted: false });
    const row = rowOf(t.w.db, t.w.campaignId);
    expect(row).toMatchObject({
      status: 'in_review',
      publish_phase: 'done',
      quota_state: 'counted',
      published_at: NOW.toISOString(),
      editable: false,
    });
    expect(row.meta_campaign_id).toBeTruthy();
    expect(row.meta_adset_id).toBeTruthy();
    // La campagne existe chez Meta (fausse), activée, avec un nom qui porte la référence.
    const remote = [...t.fake.campaigns.values()];
    expect(remote).toHaveLength(1);
    expect(remote[0]?.status).toBe('active');
    expect(remote[0]?.spec.campaignName).toBe(`Promo baskets [${publishRef(t.w.campaignId, 1)}]`);
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.resumeAttempts).toBe(1);
    // La publicité est enregistrée.
    expect(t.w.db.rows('ads')).toEqual([
      expect.objectContaining({ campaign_id: t.w.campaignId, meta_ad_id: remote[0]?.refs.adId }),
    ]);
    // Quota : retenu à la route, décompté à l'acceptation de Meta (TR-PLA-09).
    expect(t.w.hooks.count('beforeSpend')).toBe(1);
    expect(t.w.hooks.count('afterAccepted')).toBe(1);
    expect(t.w.hooks.count('release')).toBe(0);
    // Page figée pour la période (TR-PLA-08).
    expect(t.w.db.rows('page_activations')).toEqual([
      expect.objectContaining({ page_id: PAGE, first_campaign_at: NOW.toISOString() }),
    ]);
    expect(t.w.db.rows('campaign_status_events').map((e) => e.status)).toEqual([
      'publishing',
      'in_review',
    ]);
  });

  it('transmet à Meta le jeton déchiffré, l’adresse signée de la photo (stockage de Pubeka) et la monnaie du compte', async () => {
    const t = await published();
    await t.run();
    const spec = [...t.fake.campaigns.values()][0]?.spec;
    expect(spec?.adAccountId).toBe(META_AD_ACCOUNT);
    expect(spec?.account).toEqual({ code: 'USD' });
    expect(spec?.creative.mediaUrl).toBe(`https://storage.test/sources/${PHOTO_PATH}?ttl=3600`);
    expect(spec?.messagingDestinations).toEqual(['whatsapp']);
    expect(spec?.targeting.locations).toEqual([{ key: 'CM', type: 'country', countryCode: 'CM' }]);
  });

  it('un compte en naira : le budget part avec la monnaie du compte et le taux enregistré', async () => {
    const t = await published();
    // Le compte devient un compte en naira APRÈS la route (la tâche relit tout) avec un taux frais.
    const account = t.w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.currency = 'NGN';
    t.w.db.rows('exchange_rates').push({
      base: 'USD',
      quote: 'NGN',
      rate: 1500,
      source: 'manual',
      fetched_at: '2026-10-12T08:00:00Z',
    });
    await t.run();
    expect([...t.fake.campaigns.values()][0]?.spec.account).toEqual({ code: 'NGN', perUsd: 1500 });
  });

  it('le jeton ne sort jamais : ni dans la ligne de la campagne, ni dans l’historique', async () => {
    const t = await published();
    await t.run();
    expect(JSON.stringify(t.w.db.tables)).not.toContain(SECRET);
  });
});

describe('EC-META-05 — rejeu et double exécution : jamais deux campagnes', () => {
  it('rejouer la tâche après un succès ne crée rien de plus (sautée)', async () => {
    const t = await published();
    await t.run();
    expect(await t.run()).toEqual({ outcome: 'skipped', reason: 'not_publishing' });
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.resumeAttempts).toBe(1);
    expect(t.w.hooks.count('afterAccepted')).toBe(1);
  });

  it('deux exécutions simultanées : une seule crée, l’autre est sautée', async () => {
    const t = await published();
    const outcomes = await Promise.all([t.run(), t.run()]);
    expect(t.fake.createAttempts).toBe(1);
    expect(outcomes.filter((o) => o.outcome === 'accepted')).toHaveLength(1);
    expect(t.fake.campaigns.size).toBe(1);
    expect(rowOf(t.w.db, t.w.campaignId).status).toBe('in_review');
  });

  it('une campagne qui n’est pas en publication (annulée, supprimée, déjà chez Meta) est sautée sans appel à Meta', async () => {
    const t = await published();
    Object.assign(rowOf(t.w.db, t.w.campaignId), { status: 'in_review' });
    expect(await t.run()).toEqual({ outcome: 'skipped', reason: 'not_publishing' });
    t.w.db.rows('campaigns').length = 0;
    expect(await t.run()).toEqual({ outcome: 'skipped', reason: 'not_found' });
    expect(t.fake.createAttempts).toBe(0);
  });
});

describe('EC-META-05 — refus clair de Meta : échec définitif, quota rendu, jamais de nouvel essai', () => {
  it('Meta refuse nettement (paramètre invalide) : erreur, quota rendu, une seule création tentée', async () => {
    const t = await published();
    t.fake.simulateCreateRefusal(
      new AppError('meta_error', {
        meta: { title: 'Paramètre invalide', message: 'Le texte est refusé.', fix: 'retry' },
        cause: new MetaGraphError({ code: 100, message: 'brut' }, 400),
      }),
    );
    const outcome = await t.run();
    expect(outcome).toEqual({ outcome: 'failed', code: 'meta_error', uncertain: false });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
      publish_phase: 'none',
      publish_error: {
        code: 'meta_error',
        title: 'Paramètre invalide',
        message: 'Le texte est refusé.',
        fix: 'retry',
      },
    });
    expect(t.w.hooks.count('release')).toBe(1);
    expect(t.w.hooks.count('afterAccepted')).toBe(0);
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.campaigns.size).toBe(0);
    // Le message brut de Meta n'est jamais enregistré.
    expect(JSON.stringify(rowOf(t.w.db, t.w.campaignId).publish_error)).not.toContain('brut');
  });

  it('aucun moyen de paiement chez Meta : retour au brouillon, raison gardée, quota rendu (APPFLOW §8.6)', async () => {
    const t = await published();
    t.fake.simulatePaymentMethodMissing();
    const outcome = await t.run();
    expect(outcome).toMatchObject({
      outcome: 'failed',
      code: 'meta_payment_method_missing',
      uncertain: false,
    });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'draft',
      editable: true,
      quota_state: 'released',
      publish_error: { code: 'meta_payment_method_missing' },
    });
    expect(t.w.hooks.count('release')).toBe(1);
  });

  it('jeton expiré à la création (EC-META-01) : erreur meta_token_expired, quota rendu, pas de nouvel essai', async () => {
    const t = await published();
    const outcome = await t.run({ loadToken: () => Promise.resolve(FAKE_EXPIRED_TOKEN) });
    expect(outcome).toMatchObject({ outcome: 'failed', code: 'meta_token_expired' });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
    });
    expect(t.w.hooks.count('release')).toBe(1);
  });

  it('une panne passagère identifiée comme refus net n’est PAS rejouée', async () => {
    const t = await published();
    t.fake.simulateCreateRefusal(
      new AppError('meta_error', { cause: new MetaGraphError({ code: 17, message: 'x' }, 400) }),
    );
    await t.run();
    expect(t.fake.createAttempts).toBe(1);
    // Même en relançant la tâche à la main : la campagne est en erreur, rien n'est recréé.
    expect(await t.run()).toEqual({ outcome: 'skipped', reason: 'not_publishing' });
    expect(t.fake.createAttempts).toBe(1);
  });
});

describe('EC-META-05 — résultat incertain : on cherche chez Meta, on ne recrée jamais', () => {
  it('DÉLAI AVEC CRÉATION RÉUSSIE : la campagne est retrouvée par sa référence, adoptée, activée — une seule création', async () => {
    const t = await published();
    t.fake.simulateCreateTimeout({ created: true });
    const outcome = await t.run();
    expect(outcome).toEqual({ outcome: 'accepted', adopted: true });
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.campaigns.size).toBe(1);
    const row = rowOf(t.w.db, t.w.campaignId);
    const remote = [...t.fake.campaigns.values()][0];
    expect(row).toMatchObject({
      status: 'in_review',
      publish_phase: 'done',
      quota_state: 'counted',
      meta_campaign_id: remote?.refs.campaignId,
    });
    expect(t.w.db.rows('ads')).toHaveLength(1);
    expect(remote?.status).toBe('active');
    expect(t.w.hooks.count('release')).toBe(0);
  });

  it('DÉLAI SANS CRÉATION : rien chez Meta (liste lue en entier) → échec incertain, quota rendu, aucun nouvel envoi', async () => {
    const t = await published();
    t.fake.simulateCreateTimeout({ created: false });
    const outcome = await t.run();
    expect(outcome).toEqual({ outcome: 'failed', code: 'meta_error', uncertain: true });
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.campaigns.size).toBe(0);
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
      publish_error: { code: 'meta_error', uncertain: true },
    });
    expect(t.w.hooks.count('release')).toBe(1);
  });

  it('DÉLAI puis lecture de rapprochement en panne : la campagne reste « en publication » (on vérifie), quota retenu, rien de recréé', async () => {
    const t = await published();
    t.fake.simulateCreateTimeout({ created: true });
    t.fake.simulateLookupFailure();
    expect(await t.run()).toEqual({ outcome: 'pending', reason: 'lookup_failed' });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'publishing',
      publish_phase: 'creating',
      quota_state: 'held',
    });
    expect(t.w.hooks.count('release')).toBe(0);
    // La tâche rejouée (Trigger.dev, relance manuelle) ne recrée RIEN : elle rapproche, trouve, adopte, active.
    expect(await t.run()).toEqual({ outcome: 'accepted', adopted: true });
    expect(t.fake.createAttempts).toBe(1);
    expect(t.fake.campaigns.size).toBe(1);
  });

  it('DÉLAI, lecture en panne, puis rien chez Meta : la tâche rejouée conclut en échec incertain (toujours une seule création)', async () => {
    const t = await published();
    t.fake.simulateCreateTimeout({ created: false });
    t.fake.simulateLookupFailure();
    expect(await t.run()).toMatchObject({ outcome: 'pending' });
    expect(await t.run()).toEqual({ outcome: 'failed', code: 'meta_error', uncertain: true });
    expect(t.fake.createAttempts).toBe(1);
  });

  it('liste de rapprochement coupée avant la fin : « rien trouvé » ne conclut pas, la campagne reste en publication', async () => {
    const t = await published();
    t.fake.simulateCreateTimeout({ created: false });
    t.fake.simulateLookupTruncated();
    expect(await t.run()).toEqual({ outcome: 'pending', reason: 'lookup_incomplete' });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'publishing',
      quota_state: 'held',
    });
    expect(t.w.hooks.count('release')).toBe(0);
    expect(t.fake.createAttempts).toBe(1);
  });

  it('une tâche interrompue en pleine création (phase « creating ») est rejouée en rapprochement, jamais en création', async () => {
    const t = await published();
    // Une première exécution a posé la phase puis a été tuée avant de lire la réponse de Meta ; la campagne existe chez Meta.
    Object.assign(rowOf(t.w.db, t.w.campaignId), { publish_phase: 'creating' });
    await t.fake.createCampaign(TOKEN, {
      campaignName: `Promo baskets [${publishRef(t.w.campaignId, 1)}]`,
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
    const before = t.fake.createAttempts;
    expect(await t.run()).toEqual({ outcome: 'accepted', adopted: true });
    expect(t.fake.createAttempts).toBe(before);
    expect(t.fake.campaigns.size).toBe(1);
  });

  it('les restes d’une tentative précédente (autre numéro) sont supprimés chez Meta pendant le rapprochement', async () => {
    const t = await published();
    const base = publishRefBase(t.w.campaignId);
    const old = await t.fake.createCampaign(TOKEN, {
      campaignName: `Ancienne [${base}-1]`,
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
    Object.assign(rowOf(t.w.db, t.w.campaignId), { publish_ref: `${base}-2`, publish_attempt: 2 });
    t.fake.simulateCreateTimeout({ created: false });
    const outcome = await t.run();
    expect(outcome).toMatchObject({ outcome: 'failed', uncertain: true });
    expect(t.fake.campaigns.get(old.campaignId)?.deleted).toBe(true);
  });

  it('une campagne retrouvée mais INCOMPLÈTE est supprimée, et la tentative conclut en échec incertain', async () => {
    const t = await published();
    t.fake.simulateCreateTimeout({ created: true });
    // La campagne retrouvée n'a ni ensemble ni publicité.
    const original = t.fake.findCampaignsByReference.bind(t.fake);
    const connector = wrap(t.fake, {
      findCampaignsByReference: async (...args) => {
        const result = await original(...args);
        return {
          ...result,
          campaigns: result.campaigns.map((c) => ({
            ...c,
            adsetId: null,
            adId: null,
            creativeId: null,
          })),
        };
      },
    });
    const outcome = await t.run({ connector });
    expect(outcome).toEqual({ outcome: 'failed', code: 'meta_error', uncertain: true });
    expect([...t.fake.campaigns.values()].every((c) => c.deleted)).toBe(true);
    expect(t.fake.createAttempts).toBe(1);
  });
});

describe('Activation chez Meta', () => {
  it('refus net à l’activation : la campagne créée (en pause) est retirée, erreur, quota rendu', async () => {
    const t = await published();
    t.fake.simulateResumeRefusal(new AppError('meta_token_expired'));
    const outcome = await t.run();
    expect(outcome).toMatchObject({
      outcome: 'failed',
      code: 'meta_token_expired',
      uncertain: false,
    });
    expect([...t.fake.campaigns.values()].every((c) => c.deleted)).toBe(true);
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
    });
    expect(t.fake.createAttempts).toBe(1);
  });

  it('activation dont la réponse se perd MAIS appliquée : on lit l’état (actif) et on accepte, sans réactiver', async () => {
    const t = await published();
    t.fake.simulateResumeTimeout({ applied: true });
    expect(await t.run()).toEqual({ outcome: 'accepted', adopted: false });
    expect(t.fake.resumeAttempts).toBe(1);
    expect(rowOf(t.w.db, t.w.campaignId).status).toBe('in_review');
  });

  it('activation dont la réponse se perd et NON appliquée : on lit « en pause », on retire la campagne, échec incertain, sans réactiver', async () => {
    const t = await published();
    t.fake.simulateResumeTimeout({ applied: false });
    const outcome = await t.run();
    expect(outcome).toEqual({ outcome: 'failed', code: 'meta_error', uncertain: true });
    expect(t.fake.resumeAttempts).toBe(1);
    expect([...t.fake.campaigns.values()].every((c) => c.deleted)).toBe(true);
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
    });
  });

  it('activation incertaine ET état illisible : la campagne reste en publication ; la tâche rejouée lit l’état sans réactiver', async () => {
    const t = await published();
    t.fake.simulateResumeTimeout({ applied: true });
    const broken = wrap(t.fake, {
      getStatus: () =>
        Promise.reject(new AppError('meta_error', { cause: new TypeError('fetch failed') })),
    });
    expect(await t.run({ connector: broken })).toEqual({
      outcome: 'pending',
      reason: 'activation_unknown',
    });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'publishing',
      publish_phase: 'activating',
      quota_state: 'held',
    });
    expect(await t.run()).toEqual({ outcome: 'accepted', adopted: false });
    expect(t.fake.resumeAttempts).toBe(1);
    expect(t.fake.createAttempts).toBe(1);
  });
});

describe('Vérifications refaites par la tâche (tout est relu en base)', () => {
  it('une ville introuvable chez Meta : validation_failed, retour au brouillon, AUCUNE création', async () => {
    const t = await published({
      draft: { geo: { cities: [{ name: 'Villeinconnue', radius_km: 10 }] } },
    });
    const outcome = await t.run();
    expect(outcome).toMatchObject({ outcome: 'failed', code: 'validation_failed' });
    expect(t.fake.createAttempts).toBe(0);
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'draft',
      quota_state: 'released',
    });
  });

  it('la zone avec une ville connue de Meta part avec la clé de la ville et son rayon', async () => {
    const t = await published({ draft: { geo: { cities: [{ name: 'Douala', radius_km: 12 }] } } });
    t.fake.seedLocation({
      key: '2447439',
      name: 'Douala',
      type: 'city',
      countryCode: 'CM',
      region: 'Littoral',
    });
    await t.run();
    expect([...t.fake.campaigns.values()][0]?.spec.targeting.locations).toEqual([
      { key: '2447439', name: 'Douala', type: 'city', countryCode: 'CM', radiusKm: 12 },
    ]);
  });

  it('jeton devenu expiré entre la route et la tâche : échec sans aucun appel à Meta', async () => {
    const t = await published();
    const connection = t.w.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.status = 'revoked';
    expect(await t.run()).toMatchObject({ outcome: 'failed', code: 'meta_token_expired' });
    expect(t.fake.createAttempts).toBe(0);
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
    });
  });

  it('Page retirée de la formule entre la route et la tâche : échec page_limit_reached, aucune création', async () => {
    const t = await published();
    const page = t.w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    expect(await t.run()).toMatchObject({ outcome: 'failed', code: 'page_limit_reached' });
    expect(t.fake.createAttempts).toBe(0);
  });

  it('photo supprimée entre la route et la tâche : 410 gone, aucune création', async () => {
    const t = await published();
    t.w.db.objects.delete(`sources/${PHOTO_PATH}`);
    expect(await t.run()).toMatchObject({ outcome: 'failed', code: 'gone' });
    expect(t.fake.createAttempts).toBe(0);
  });

  it('un jeton illisible (clé de chiffrement perdue) : erreur interne, rien chez Meta, le message ne contient rien de secret', async () => {
    const t = await published();
    const outcome = await t.run({
      loadToken: () => Promise.reject(new Error(`déchiffrement impossible de ${SECRET}`)),
    });
    expect(outcome).toMatchObject({ outcome: 'failed', code: 'internal_error' });
    expect(t.fake.createAttempts).toBe(0);
    expect(JSON.stringify(rowOf(t.w.db, t.w.campaignId).publish_error)).not.toContain(SECRET);
  });

  it('le décompte du quota (S24) qui échoue ne défait pas la publication : campagne partie, quota resté « retenu » pour rattrapage', async () => {
    const t = await published();
    const outcome = await t.run({ afterAccepted: () => Promise.reject(new Error('S24 en panne')) });
    expect(outcome).toEqual({ outcome: 'accepted', adopted: false });
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'in_review',
      quota_state: 'held',
    });
  });

  it('une republication après refus ne rend ni ne décompte de quota (déjà décompté)', async () => {
    const w = publishWorld();
    Object.assign(rowOf(w.db, w.campaignId), {
      status: 'rejected',
      quota_state: 'counted',
      publish_attempt: 1,
    });
    await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, acceptLiability: true },
      w.deps,
    );
    const fake = new FakeMetaConnector();
    const outcome = await runPublication(
      { requestId: 'r', svc: w.db.asService(), now: () => NOW },
      { campaignId: w.campaignId, workspaceId: W },
      {
        connector: fake,
        loadToken: () => Promise.resolve(TOKEN),
        metaPublishEnabled: () => true,
        afterAccepted: w.hooks.afterAccepted,
        release: w.hooks.release,
      },
    );
    expect(outcome.outcome).toBe('accepted');
    expect(w.hooks.count('afterAccepted')).toBe(0);
    expect(rowOf(w.db, w.campaignId)).toMatchObject({
      status: 'in_review',
      quota_state: 'counted',
    });
  });
});

/** Tout appel à l'objet est compté, quelle que soit la méthode : « aucun appel au connecteur » se prouve ici, pas sur un seul compteur. */
function counting<T extends object>(target: T): { proxy: T; calls: string[] } {
  const calls: string[] = [];
  const proxy = new Proxy(target, {
    get(obj, key, receiver) {
      const value: unknown = Reflect.get(obj, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(key));
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
  return { proxy, calls };
}

describe('runPublication — interrupteur de publication réelle (PUBEKA_META_PUBLISH)', () => {
  it('DÉSACTIVÉ, rien encore créé : échec net provider_unavailable, quota rendu, AUCUN appel au connecteur ni au déchiffrement du jeton', async () => {
    const t = await published();
    const { proxy, calls } = counting(t.fake);
    let tokenLoads = 0;
    const outcome = await t.run({
      connector: proxy,
      metaPublishEnabled: () => false,
      loadToken: () => {
        tokenLoads += 1;
        return Promise.resolve(TOKEN);
      },
    });
    expect(outcome).toMatchObject({ outcome: 'failed', code: 'provider_unavailable' });
    expect(calls).toEqual([]);
    expect(tokenLoads).toBe(0);
    expect(t.fake.createAttempts).toBe(0);
    expect(t.fake.resumeAttempts).toBe(0);
    expect(rowOf(t.w.db, t.w.campaignId)).toMatchObject({
      status: 'error',
      publish_phase: 'none',
      quota_state: 'released',
      meta_campaign_id: null,
    });
    expect(t.w.hooks.count('release')).toBe(1);
    expect(t.w.hooks.count('afterAccepted')).toBe(0);
  });

  it.each(['creating', 'created', 'activating'] as const)(
    'DÉSACTIVÉ, phase « %s » (des éléments existent peut-être chez Meta) : en attente, AUCUN appel, rien n’est modifié',
    async (phase) => {
      const t = await published();
      Object.assign(rowOf(t.w.db, t.w.campaignId), { publish_phase: phase });
      const before = JSON.stringify(t.w.db.rows('campaigns'));
      const { proxy, calls } = counting(t.fake);
      const outcome = await t.run({ connector: proxy, metaPublishEnabled: () => false });
      expect(outcome).toEqual({ outcome: 'pending', reason: 'publish_disabled' });
      expect(calls).toEqual([]);
      expect(JSON.stringify(t.w.db.rows('campaigns'))).toBe(before);
      expect(t.w.hooks.count('release')).toBe(0);
    },
  );

  it('réactivé : la même tâche rejouée aboutit (rien n’a été perdu)', async () => {
    const t = await published();
    Object.assign(rowOf(t.w.db, t.w.campaignId), { publish_phase: 'creating' });
    expect(await t.run({ metaPublishEnabled: () => false })).toEqual({
      outcome: 'pending',
      reason: 'publish_disabled',
    });
    const again = await t.run({ metaPublishEnabled: () => true });
    expect(again.outcome).not.toBe('pending');
  });

  it('une campagne déjà terminée ou absente reste ignorée sans erreur, interrupteur désactivé ou non', async () => {
    const t = await published();
    Object.assign(rowOf(t.w.db, t.w.campaignId), { publish_phase: 'done' });
    expect(await t.run({ metaPublishEnabled: () => false })).toEqual({
      outcome: 'skipped',
      reason: 'done',
    });
  });
});
