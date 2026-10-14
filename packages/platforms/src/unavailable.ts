import { AppError } from '@pubeka/contracts';
import type {
  DailyStats,
  HealthCheckItem,
  Platform,
  PlatformAdAccount,
  PlatformCampaignRefs,
  PlatformConnector,
  PlatformPage,
  PlatformRejection,
  PlatformStatus,
  PlatformToken,
} from './types';

/** Connecteur « bientôt » : `available` vaut faux et toute opération répond provider_unavailable (503). */
export class UnavailableConnector implements PlatformConnector {
  readonly available = false;

  constructor(readonly platform: Platform) {}

  private refusal(): AppError {
    return new AppError('provider_unavailable', { meta: { platform: this.platform } });
  }

  authorizeUrl(): string {
    throw this.refusal();
  }
  exchangeCode(): Promise<PlatformToken> {
    return Promise.reject(this.refusal());
  }
  listAdAccounts(): Promise<PlatformAdAccount[]> {
    return Promise.reject(this.refusal());
  }
  listPages(): Promise<PlatformPage[]> {
    return Promise.reject(this.refusal());
  }
  healthCheck(): Promise<HealthCheckItem[]> {
    return Promise.reject(this.refusal());
  }
  createCampaign(): Promise<PlatformCampaignRefs> {
    return Promise.reject(this.refusal());
  }
  updateCampaign(): Promise<void> {
    return Promise.reject(this.refusal());
  }
  pause(): Promise<void> {
    return Promise.reject(this.refusal());
  }
  resume(): Promise<void> {
    return Promise.reject(this.refusal());
  }
  deleteCampaign(): Promise<boolean> {
    return Promise.reject(this.refusal());
  }
  getStatus(): Promise<PlatformStatus> {
    return Promise.reject(this.refusal());
  }
  fetchStats(): Promise<DailyStats[]> {
    return Promise.reject(this.refusal());
  }
  fetchRejection(): Promise<PlatformRejection | null> {
    return Promise.reject(this.refusal());
  }
}
