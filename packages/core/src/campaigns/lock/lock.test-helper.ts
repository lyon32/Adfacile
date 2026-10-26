// Monde de test de la pause automatique (S19b) : un espace, une fausse Meta, PLUSIEURS campagnes déjà chez Meta, une base en mémoire
// qui sait répondre à `workspaces_to_lock_pause` (même règle que la fonction SQL de la migration 0022). Valeurs d'essai uniquement.
import { workspaceAccess } from '@pubeka/billing';
import {
  FakeMetaConnector,
  type PlatformCampaignRefs,
  type PlatformToken,
} from '@pubeka/platforms';
import type { MemberCtx, ServiceCtx } from '../../context';
import { addDraft, NOW, OTHER_W, W } from '../campaigns.test-helper';
import type { CampaignControlDeps } from '../publish/campaign-control';
import { publishRef } from '../publish/publish-types';
import {
  META_AD_ACCOUNT,
  publishWorld,
  rowOf,
  type PublishWorld,
} from '../publish/publish.test-helper';

export const TOKEN: PlatformToken = { accessToken: 'jeton-de-test', expiresAt: null };
export const DAY = 24 * 3600 * 1000;
/** Fin de période de l'abonnement d'essai de `publishWorld` (1er novembre 2026). */
export const PERIOD_END = Date.parse('2026-11-01T00:00:00.000Z');

export interface LockWorld {
  w: PublishWorld;
  fake: FakeMetaConnector;
  deps: CampaignControlDeps;
  /** Ajoute une campagne chez la fausse Meta ET dans la base, dans l'état Pubeka demandé. */
  add: (
    status: 'in_review' | 'active' | 'paused' | 'stopped' | 'error' | 'publishing',
    over?: { workspaceId?: string; name?: string; pauseReason?: string | null },
  ) => Promise<string>;
  /** Contexte de service à l'heure donnée. */
  serviceAt: (at: Date) => ServiceCtx;
  /** Le client (membre) à l'heure donnée, avec l'état d'accès donné. */
  memberAt: (
    access: MemberCtx['workspace']['access'],
    role?: MemberCtx['workspace']['role'],
  ) => MemberCtx;
  /** Le statut chez la fausse Meta d'une campagne Pubeka. */
  metaStatus: (id: string) => string | undefined;
}

export function lockWorld(): LockWorld {
  const w = publishWorld();
  // L'unique campagne de `publishWorld` (brouillon) ne nous sert pas : on la retire pour ne compter que les nôtres.
  w.db.rows('campaigns').splice(0, w.db.rows('campaigns').length);
  const fake = new FakeMetaConnector();
  const refsOf = new Map<string, string>();

  const add: LockWorld['add'] = async (status, over = {}) => {
    const workspaceId = over.workspaceId ?? W;
    if (
      workspaceId !== W &&
      !w.db.rows('ad_accounts').some((a) => a.workspace_id === workspaceId)
    ) {
      // Un autre espace a SON compte publicitaire et SA connexion Meta : rien n'est partagé avec l'espace de l'essai.
      w.db.rows('ad_accounts').push({
        id: 'ad-other',
        workspace_id: workspaceId,
        name: 'Compte voisin',
        meta_ad_account_id: 'act_100000000002',
        currency: 'USD',
        has_payment_method: true,
        meta_connection_id: 'conn-other',
      });
      w.db.rows('meta_connections').push({
        id: 'conn-other',
        workspace_id: workspaceId,
        status: 'ok',
        expires_at: '2026-12-31T00:00:00.000Z',
      });
    }
    const id = addDraft(w.db, {
      name: over.name ?? 'Promo baskets',
      workspace_id: workspaceId,
      objective: 'OUTCOME_ENGAGEMENT',
      destination: 'WHATSAPP',
      ...(workspaceId === W ? {} : { ad_account_id: 'ad-other', page_id: null, analysis_id: null }),
    });
    const refs = await fake.createCampaign(TOKEN, {
      campaignName: `Promo [${publishRef(id, 1)}]`,
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
    Object.assign(rowOf(w.db, id), {
      status,
      editable: false,
      meta_campaign_id: refs.campaignId,
      meta_adset_id: refs.adsetId,
      publish_ref: publishRef(id, 1),
      publish_attempt: 1,
      quota_state: 'counted',
      pause_reason: over.pauseReason ?? null,
      lock_pause_failures: 0,
      lock_pause_retry_at: null,
      ...(status === 'paused' ? { paused_at: NOW.toISOString() } : {}),
    });
    w.db.rows('ads').push({
      workspace_id: workspaceId,
      campaign_id: id,
      meta_ad_id: refs.adId,
      meta_creative_id: refs.creativeId,
    });
    refsOf.set(id, refs.campaignId);
    // Les comptes d'appels ne comptent que ce que le TEST provoque, pas la mise en place.
    fake.pauseAttempts = 0;
    fake.resumeAttempts = 0;
    return id;
  };

  // `workspaces_to_lock_pause` : les espaces dont la DERNIÈRE formule les verrouille à l'heure donnée et qui ont une campagne vivante.
  Reflect.set(w.db, 'rpc', (name: string, args: { p_now: string; p_limit: number }) => {
    if (name !== 'workspaces_to_lock_pause') {
      return Promise.resolve({
        data: null,
        error: { code: '42883', message: 'fonction inconnue' },
      });
    }
    const now = new Date(args.p_now);
    const ids = new Set<string>();
    for (const workspace of w.db.rows('workspaces')) {
      const subs = w.db.rows('subscriptions').filter((s) => s.workspace_id === workspace.id);
      const latest = subs[subs.length - 1];
      if (latest === undefined) continue;
      const access = workspaceAccess(
        {
          status: latest.status as 'active',
          period_end: latest.period_end as string,
          grace_until: (latest.grace_until as string | null) ?? null,
        },
        now,
      );
      const live = w.db
        .rows('campaigns')
        .some(
          (c) =>
            c.workspace_id === workspace.id &&
            ['in_review', 'active', 'error'].includes(String(c.status)) &&
            c.meta_campaign_id !== null &&
            (typeof c.lock_pause_retry_at !== 'string' ||
              Date.parse(c.lock_pause_retry_at) <= now.getTime()),
        );
      if (access === 'locked' && live) ids.add(String(workspace.id));
    }
    return Promise.resolve({
      data: [...ids].slice(0, args.p_limit).map((workspace_id) => ({ workspace_id })),
      error: null,
    });
  });
  for (const row of w.db.rows('workspaces')) row.status = 'active';
  w.db.rows('workspaces').push({ id: OTHER_W, owner_id: w.ctx.user.id, status: 'active' });

  return {
    w,
    fake,
    deps: {
      connector: fake,
      loadToken: () => Promise.resolve(TOKEN),
      metaPublishEnabled: () => true,
    },
    add,
    serviceAt: (at) => ({ requestId: 'req_LOCK', svc: w.db.asService(), now: () => at }),
    memberAt: (access, role = 'owner') => ({
      ...w.ctx,
      workspace: { id: W, role, access },
    }),
    metaStatus: (id) => {
      const campaignId = refsOf.get(id);
      return campaignId === undefined ? undefined : fake.campaigns.get(campaignId)?.status;
    },
  };
}

/** Identifiants chez la fausse Meta de la première campagne créée. */
export function firstRefs(t: LockWorld): PlatformCampaignRefs {
  const campaign = [...t.fake.campaigns.values()][0];
  if (campaign === undefined) throw new Error('aucune campagne chez la fausse Meta');
  return campaign.refs;
}
