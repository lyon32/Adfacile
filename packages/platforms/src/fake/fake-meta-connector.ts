// Fausse implémentation de Meta (TESTING §6.1) : campagnes en mémoire avec leurs statuts, et les pannes que
// Pubeka doit savoir traiter. C'est la même que celle activée par PUBEKA_FAKE_PROVIDERS en développement.
// Elle respecte le contrat commun (`platformConnectorContract`) : mêmes codes d'erreur que le vrai connecteur.
import { AppError } from '@pubeka/contracts';
import { PUBEKA_MIN_DAILY_USD_CENTS, usdCentsToAccountMinor } from '../meta/account-currency';
import { FB_MIN_DAILY_BUDGET_CENTS } from '../meta/currency';
import { MetaValidationError, toAppError } from '../meta/errors';
import { nameHasReference } from '../meta/reference-match';
import type {
  CampaignLookup,
  DeliveryEstimate,
  DailyStats,
  DateRange,
  HealthCheckItem,
  LocationMatch,
  LocationQuery,
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
  statusOverride?: PlatformStatus | undefined;
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
  private sequence = 120_000_000_000;
  private transientFailures = 0;
  private createTimeout: { created: boolean } | undefined;
  private resumeTimeout: { applied: boolean } | undefined;
  private createRefusal: AppError | undefined;
  private resumeRefusal: AppError | undefined;
  private pauseRefusal: AppError | undefined;
  private estimate: DeliveryEstimate | null = null;
  private lookupFailures = 0;
  private lookupTruncated = false;
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

  /**
   * Prochaine CRÉATION : la réponse se perd (délai dépassé). `created` dit si Meta a quand même créé la campagne (EC-META-05) :
   * `true` = la campagne existe chez Meta mais Pubeka n'a pas reçu ses identifiants ; `false` = rien n'a été créé.
   */
  simulateCreateTimeout(options: { created: boolean }): void {
    this.createTimeout = options;
  }

  /** Prochaine ACTIVATION (`resume`) : la réponse se perd ; `applied` dit si Meta a quand même activé la campagne. */
  simulateResumeTimeout(options: { applied: boolean }): void {
    this.resumeTimeout = options;
  }

  /** Meta refuse clairement la prochaine création (refus net : rien n'est créé), avec ce code de la liste fermée. */
  simulateCreateRefusal(error: AppError): void {
    this.createRefusal = error;
  }

  /** Meta refuse clairement la prochaine activation. */
  simulateResumeRefusal(error: AppError): void {
    this.resumeRefusal = error;
  }

  /** La lecture de rapprochement échoue (Meta ne répond pas) : la tâche ne peut pas conclure. */
  simulateLookupFailure(times = 1): void {
    this.lookupFailures = times;
  }

  /** La liste de rapprochement est coupée avant la fin : « rien trouvé » ne conclut pas. */
  simulateLookupTruncated(truncated = true): void {
    this.lookupTruncated = truncated;
  }

  /** Nombre de créations REÇUES par la fausse Meta (aboutissent ou non) : prouve qu'on ne recrée jamais d'office. */
  createAttempts = 0;

  /** Estimation que renverra `estimateDelivery` (valeurs d'ESSAI ; `null` = pas d'estimation, comme Meta qui ne répond pas). */
  simulateEstimate(estimate: DeliveryEstimate | null): void {
    this.estimate = estimate;
  }

  /** Dernière demande d'estimation reçue : prouve ce que `core` a transmis à Meta. */
  lastEstimateSpec: PublishSpec | null = null;

  /** Nombre de mises en pause REÇUES (aboutissent ou non). */
  pauseAttempts = 0;

  /** Meta répond à `getStatus` avec ce statut (ex. facturation encore en échec), quel que soit le statut interne. */
  simulateRemoteStatus(refs: PlatformCampaignRefs, status: PlatformStatus | undefined): void {
    const campaign = this.campaigns.get(refs.campaignId);
    if (campaign) campaign.statusOverride = status;
  }

  /** Meta refuse clairement la prochaine mise en pause. */
  simulatePauseRefusal(error: AppError): void {
    this.pauseRefusal = error;
  }

  /** Nombre d'activations REÇUES (aboutissent ou non) : prouve qu'une activation incertaine n'est jamais rejouée. */
  resumeAttempts = 0;

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

  /** Lieux connus de la fausse Meta : `seedLocation` en ajoute ; chaque nom donne la clé `loc-<nom en minuscules>`. */
  private readonly locations: LocationMatch[] = [];
  seedLocation(match: LocationMatch): void {
    this.locations.push(match);
  }

  estimateDelivery(token: PlatformToken, spec: PublishSpec): Promise<DeliveryEstimate | null> {
    return this.respond(token, () => {
      this.lastEstimateSpec = spec;
      return this.estimate;
    });
  }

  searchLocations(token: PlatformToken, query: LocationQuery): Promise<LocationMatch[]> {
    return this.respond(token, () => {
      const wanted = query.name.trim().toLowerCase();
      return this.locations.filter(
        (l) =>
          l.type === query.type &&
          l.name.toLowerCase() === wanted &&
          (query.countryCode === undefined || l.countryCode === query.countryCode),
      );
    });
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
        spec.dailyBudgetUsdCents < PUBEKA_MIN_DAILY_USD_CENTS
      ) {
        throw new AppError('budget_too_low', { meta: { minUsdCents: PUBEKA_MIN_DAILY_USD_CENTS } });
      }
      // Comme le vrai connecteur : le budget est converti dans la monnaie du compte (refus si taux ou monnaie inutilisables).
      try {
        usdCentsToAccountMinor(spec.dailyBudgetUsdCents, spec.account);
      } catch (error) {
        throw toAppError(error);
      }
      this.createAttempts += 1;
      if (this.paymentMissing) throw new AppError('meta_payment_method_missing');
      if (this.createRefusal !== undefined) {
        const refusal = this.createRefusal;
        this.createRefusal = undefined;
        throw refusal;
      }
      const timeout = this.createTimeout;
      this.createTimeout = undefined;
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
      if (timeout !== undefined) {
        // La réponse se perd. Si Meta n'a rien créé, on retire la campagne que l'on vient de poser.
        if (!timeout.created) this.campaigns.delete(refs.campaignId);
        throw new AppError('meta_error', {
          cause: new DOMException('délai dépassé', 'TimeoutError'),
        });
      }
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
      if (patch.dailyBudgetUsdCents !== undefined && patch.account === undefined) {
        // Comme le vrai connecteur : sans monnaie du compte, le budget ne peut pas être exprimé.
        throw toAppError(new MetaValidationError('La monnaie du compte publicitaire est requise.'));
      }
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
      this.pauseAttempts += 1;
      const campaign = this.find(refs);
      if (this.pauseRefusal !== undefined) {
        const refusal = this.pauseRefusal;
        this.pauseRefusal = undefined;
        throw refusal;
      }
      campaign.status = 'paused';
    });
  }

  resume(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void> {
    return this.respond(token, () => {
      this.resumeAttempts += 1;
      const campaign = this.find(refs);
      if (this.resumeRefusal !== undefined) {
        const refusal = this.resumeRefusal;
        this.resumeRefusal = undefined;
        throw refusal;
      }
      const timeout = this.resumeTimeout;
      this.resumeTimeout = undefined;
      if (timeout !== undefined) {
        if (timeout.applied) campaign.status = this.options.activateAs ?? 'active';
        throw new AppError('meta_error', {
          cause: new DOMException('délai dépassé', 'TimeoutError'),
        });
      }
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

  findCampaignsByReference(
    token: PlatformToken,
    adAccountId: string,
    reference: string,
  ): Promise<CampaignLookup> {
    return this.respond(token, () => {
      if (this.lookupFailures > 0) {
        this.lookupFailures -= 1;
        throw new AppError('meta_error', { cause: new TypeError('fetch failed') });
      }
      const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      const matches = [...this.campaigns.values()].filter(
        (c) =>
          !c.deleted &&
          c.refs.adAccountId === account &&
          nameHasReference(c.spec.campaignName, reference),
      );
      return {
        exhaustive: !this.lookupTruncated,
        campaigns: this.lookupTruncated
          ? []
          : matches.map((c) => ({
              campaignId: c.refs.campaignId,
              name: c.spec.campaignName,
              effectiveStatus: c.status.toUpperCase(),
              adsetId: c.refs.adsetId,
              adId: c.refs.adId,
              creativeId: c.refs.creativeId,
            })),
      };
    });
  }

  getStatus(token: PlatformToken, refs: PlatformCampaignRefs): Promise<PlatformStatus> {
    return this.respond(token, () => {
      const campaign = this.find(refs);
      return (
        campaign.statusOverride ?? {
          status: campaign.status,
          rawStatus: campaign.status.toUpperCase(),
        }
      );
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
