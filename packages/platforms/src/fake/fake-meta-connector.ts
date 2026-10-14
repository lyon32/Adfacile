// Fausse implémentation de Meta (TESTING §6.1) : campagnes en mémoire avec leurs statuts, et les pannes que
// Pubeka doit savoir traiter. C'est la même que celle activée par PUBEKA_FAKE_PROVIDERS en développement.
// Elle respecte le contrat commun (`platformConnectorContract`) : mêmes codes d'erreur que le vrai connecteur.
import { AppError } from '@pubeka/contracts';
import { FB_MIN_DAILY_BUDGET_CENTS } from '../meta/currency';
import type {
  DailyStats,
  DateRange,
  HealthCheckItem,
  PlatformAdAccount,
  PlatformCampaignRefs,
  PlatformConnector,
  PlatformPage,
  PlatformRejection,
  PlatformStatus,
  PlatformToken,
  PublishPatch,
  PublishSpec,
} from '../types';

/** Jeton que la fausse Meta traite comme expiré. */
export const FAKE_EXPIRED_TOKEN: PlatformToken = {
  accessToken: 'fake-expired-token',
  expiresAt: null,
};

export interface FakeCampaign {
  refs: PlatformCampaignRefs;
  spec: PublishSpec;
  status: PlatformStatus['status'];
  rejection: string | null;
  deleted: boolean;
}

export interface FakeMetaOptions {
  /** Statut à l'activation : `in_review` simule la relecture de Meta avant diffusion. */
  activateAs?: 'active' | 'in_review';
}

export class FakeMetaConnector implements PlatformConnector {
  readonly platform = 'meta' as const;
  readonly available = true;
  readonly campaigns = new Map<string, FakeCampaign>();
  /** Dernières valeurs reçues, pour que les tests vérifient ce que `core` a transmis. */
  lastRedirectUri: string | null = null;
  lastHealthTarget: { adAccountId: string; pageId: string } | null = null;
  private sequence = 1000;
  private transientFailures = 0;
  private paymentMissing = false;
  private readonly stats = new Map<string, DailyStats[]>();

  constructor(private readonly options: FakeMetaOptions = {}) {}

  // ── Pannes simulables ────────────────────────────────────────────────────────────────────────────────────

  /** Le moyen de paiement du compte publicitaire est absent : toute création est refusée. */
  simulatePaymentMethodMissing(missing = true): void {
    this.paymentMissing = missing;
  }

  /** Les `count` prochains appels échouent par une erreur passagère de Meta (`meta_error`). */
  simulateTransientError(count = 1): void {
    this.transientFailures = count;
  }

  /** Meta refuse la publicité, avec ce motif. */
  simulateRejection(refs: PlatformCampaignRefs, reason: string): void {
    const campaign = this.campaigns.get(refs.campaignId);
    if (campaign) {
      campaign.status = 'rejected';
      campaign.rejection = reason;
    }
  }

  /** Meta approuve la publicité en relecture. */
  simulateApproval(refs: PlatformCampaignRefs): void {
    const campaign = this.campaigns.get(refs.campaignId);
    if (campaign?.status === 'in_review') campaign.status = 'active';
  }

  /** Statistiques que renverra `fetchStats` pour cette campagne. */
  seedStats(refs: PlatformCampaignRefs, days: DailyStats[]): void {
    this.stats.set(refs.campaignId, days);
  }

  // ── Interface ────────────────────────────────────────────────────────────────────────────────────────────

  private guard(token: PlatformToken): void {
    if (this.transientFailures > 0) {
      this.transientFailures -= 1;
      throw new AppError('meta_error', { cause: new Error('erreur passagère simulée') });
    }
    if (token.accessToken === FAKE_EXPIRED_TOKEN.accessToken) {
      throw new AppError('meta_token_expired');
    }
  }

  private find(refs: PlatformCampaignRefs): FakeCampaign {
    const campaign = this.campaigns.get(refs.campaignId);
    if (!campaign || campaign.deleted) {
      throw new AppError('meta_error', {
        cause: new Error(`campagne inconnue : ${refs.campaignId}`),
      });
    }
    return campaign;
  }

  authorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({ state, redirect_uri: redirectUri, response_type: 'code' });
    return `https://fake-meta.test/dialog/oauth?${params.toString()}`;
  }

  exchangeCode(code: string, redirectUri: string): Promise<PlatformToken> {
    this.lastRedirectUri = redirectUri;
    if (!code) return Promise.reject(new AppError('meta_error'));
    return Promise.resolve({ accessToken: `fake-token-${code}`, expiresAt: null });
  }

  listAdAccounts(token: PlatformToken): Promise<PlatformAdAccount[]> {
    return this.respond(token, () => [
      {
        id: 'act_100000000001',
        name: 'Compte de test',
        statusCode: 1,
        statusLabel: 'Actif',
        usable: true,
        currency: 'USD',
        timezone: 'Africa/Douala',
        pixelsCount: 1,
      },
    ]);
  }

  listPages(token: PlatformToken): Promise<PlatformPage[]> {
    return this.respond(token, () => [
      { id: '200000000001', name: 'Page de test', category: 'Boutique' },
    ]);
  }

  healthCheck(
    token: PlatformToken,
    adAccountId: string,
    pageId: string,
  ): Promise<HealthCheckItem[]> {
    this.lastHealthTarget = { adAccountId, pageId };
    return this.respond(token, () => [
      { key: 'ad_account', status: 'ok' },
      { key: 'payment_method', status: this.paymentMissing ? 'missing' : 'ok' },
      { key: 'page', status: 'ok' },
      { key: 'instagram', status: 'ok' },
      { key: 'whatsapp', status: 'ok' },
      { key: 'pixel', status: 'ok' },
      { key: 'permissions', status: 'ok' },
    ]);
  }

  createCampaign(token: PlatformToken, spec: PublishSpec): Promise<PlatformCampaignRefs> {
    return this.respond(token, () => {
      if (
        !Number.isInteger(spec.dailyBudgetUsdCents) ||
        spec.dailyBudgetUsdCents < FB_MIN_DAILY_BUDGET_CENTS
      ) {
        throw new AppError('budget_too_low', { meta: { minUsdCents: FB_MIN_DAILY_BUDGET_CENTS } });
      }
      if (this.paymentMissing) throw new AppError('meta_payment_method_missing');
      this.sequence += 4;
      const refs: PlatformCampaignRefs = {
        campaignId: String(this.sequence),
        adsetId: String(this.sequence + 1),
        adId: String(this.sequence + 2),
        creativeId: String(this.sequence + 3),
        adAccountId: spec.adAccountId.startsWith('act_')
          ? spec.adAccountId
          : `act_${spec.adAccountId}`,
      };
      // Comme chez Meta : tout est créé en pause.
      this.campaigns.set(refs.campaignId, {
        refs,
        spec,
        status: 'paused',
        rejection: null,
        deleted: false,
      });
      return refs;
    });
  }

  updateCampaign(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
    patch: PublishPatch,
  ): Promise<void> {
    return this.respond(token, () => {
      const campaign = this.find(refs);
      if (
        patch.dailyBudgetUsdCents !== undefined &&
        patch.dailyBudgetUsdCents < FB_MIN_DAILY_BUDGET_CENTS
      ) {
        throw new AppError('budget_too_low', { meta: { minUsdCents: FB_MIN_DAILY_BUDGET_CENTS } });
      }
      campaign.spec = {
        ...campaign.spec,
        ...(patch.name === undefined ? {} : { campaignName: patch.name }),
        ...(patch.dailyBudgetUsdCents === undefined
          ? {}
          : { dailyBudgetUsdCents: patch.dailyBudgetUsdCents }),
        ...(patch.endDate === undefined ? {} : { endDate: patch.endDate }),
      };
    });
  }

  pause(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void> {
    return this.respond(token, () => {
      this.find(refs).status = 'paused';
    });
  }

  resume(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void> {
    return this.respond(token, () => {
      const campaign = this.find(refs);
      if (campaign.status === 'rejected') {
        throw new AppError('meta_error', {
          cause: new Error('une publicité refusée ne peut pas être activée'),
        });
      }
      campaign.status = this.options.activateAs ?? 'active';
    });
  }

  deleteCampaign(token: PlatformToken, refs: PlatformCampaignRefs): Promise<boolean> {
    return this.respond(token, () => {
      if (!refs.campaignId) return false;
      this.find(refs).deleted = true;
      return true;
    });
  }

  getStatus(token: PlatformToken, refs: PlatformCampaignRefs): Promise<PlatformStatus> {
    return this.respond(token, () => {
      const campaign = this.find(refs);
      return { status: campaign.status, rawStatus: campaign.status.toUpperCase() };
    });
  }

  fetchStats(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
    range: DateRange,
  ): Promise<DailyStats[]> {
    return this.respond(token, () => {
      this.find(refs);
      return (this.stats.get(refs.campaignId) ?? []).filter(
        (d) => d.date >= range.since && d.date <= range.until,
      );
    });
  }

  fetchRejection(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
  ): Promise<PlatformRejection | null> {
    return this.respond(token, () => {
      const campaign = this.find(refs);
      return campaign.status === 'rejected' && campaign.rejection
        ? { reason: campaign.rejection, adId: refs.adId }
        : null;
    });
  }

  /** Exécute `operation` après les contrôles communs ; une erreur devient un rejet de promesse. */
  private respond<T>(token: PlatformToken, operation: () => T): Promise<T> {
    try {
      this.guard(token);
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
