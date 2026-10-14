// Interface commune des connecteurs de plateformes (LLD §6.14, ARCHITECTURE §6).
// Les montants sont des entiers en centimes de dollar (`...UsdCents`) ; les dates de calendrier
// sont des chaînes AAAA-MM-JJ, interprétées dans le fuseau du compte publicitaire.

export type Platform = 'meta' | 'google' | 'tiktok';

/** Jeton déjà déchiffré par l'appelant (`core`) ; il ne sort jamais du serveur. */
export interface PlatformToken {
  accessToken: string;
  expiresAt: Date | null;
}

export interface DateRange {
  /** AAAA-MM-JJ, inclus. */
  since: string;
  /** AAAA-MM-JJ, inclus. */
  until: string;
}

export interface PlatformAdAccount {
  id: string;
  name: string;
  /** Statut brut de Meta (entier) : 1 = actif… */
  statusCode: number;
  /** Libellé en français du statut. */
  statusLabel: string;
  /** Faux si Meta refuserait toute création (compte désactivé, impayé…). */
  usable: boolean;
  currency: string | null;
  timezone: string | null;
  /** Nombre d'ensembles de données (pixels) du compte ; null si non lu ou refusé. */
  pixelsCount: number | null;
}

export interface PlatformPage {
  id: string;
  name: string;
  category: string | null;
}

export interface HealthCheckItem {
  key:
    'ad_account' | 'payment_method' | 'page' | 'instagram' | 'whatsapp' | 'pixel' | 'permissions';
  status: 'ok' | 'missing' | 'warning';
  /** Identifiants utiles à l'écran (ex. pixel trouvé) ; jamais de jeton. */
  detail?: Record<string, string | number | boolean | null>;
}

/** La Page et ce qui y est rattaché, lu par Pubeka à la connexion (bilan de santé, F1). */
export interface MetaPageContext {
  id: string;
  name: string | null;
  instagramAccountId: string | null;
  instagramConnected: boolean;
  whatsappConnected: boolean;
  whatsappNumber: string | null;
  whatsappPhoneNumberId: string | null;
}

export interface TargetingLocation {
  /** Clé de la Targeting Search API de Meta (ou code pays pour un pays). */
  key: string;
  name?: string;
  /** country, city, region, geo_market ; toute autre valeur est traitée comme une ville. */
  type: string;
  countryCode?: string;
}

export interface TargetingItem {
  id?: string;
  name?: string;
}

export interface PublishTargeting {
  ageMin?: number;
  ageMax?: number;
  locations: TargetingLocation[];
  /** `male` / `female`, ou les codes 1 / 2 de Meta. Deux valeurs = pas de filtre. */
  genders?: readonly (string | number)[];
  interests?: readonly TargetingItem[];
  behaviors?: readonly TargetingItem[];
  /** 1 pour autoriser l'élargissement d'audience ; toute autre valeur vaut 0. */
  advantageAudience?: unknown;
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  name?: string;
  description?: string;
  link?: string;
}

export interface PublishCreative {
  mediaType?: 'image' | 'video' | 'carousel' | 'flexible' | 'none';
  mediaUrl?: string;
  mediaItems?: readonly MediaItem[];
  message?: string;
  headline?: string;
  description?: string;
  link?: string;
  callToAction?: string;
  displayLink?: string;
  welcomeMessage?: string;
  urlTags?: string;
  bodies?: readonly string[];
  titles?: readonly string[];
}

/** Tout ce dont le connecteur a besoin pour créer une campagne complète (campagne, ensemble, création, publicité). */
export interface PublishSpec {
  campaignName: string;
  adsetName?: string;
  adName?: string;
  /** Objectif Meta (OUTCOME_*) ; d'anciennes valeurs sont normalisées. */
  objective: string;
  /** `act_123…` ou le numéro seul. */
  adAccountId: string;
  page: MetaPageContext;
  destinationType?: string;
  optimizationGoal?: string;
  /** messenger, instagram, whatsapp : une ou plusieurs applications. */
  messagingDestinations?: readonly string[];
  whatsappPhoneNumber?: string;
  whatsappPhoneNumberId?: string;
  pixelId?: string;
  customEventType?: string;
  phoneNumber?: string;
  websiteUrl?: string;
  websiteMessageApps?: readonly string[];
  /** Faux = refus des publicités multi-annonceurs. */
  multiAdvertiserAds?: boolean;
  budgetType?: 'daily' | 'lifetime';
  dailyBudgetUsdCents: number;
  lifetimeBudgetUsdCents?: number;
  costPerResultUsdCents?: number;
  startDate: string;
  endDate?: string;
  targeting: PublishTargeting;
  creative: PublishCreative;
}

/** Ce qui peut changer après publication : seulement ces champs sont modifiables. */
export interface PublishPatch {
  name?: string;
  dailyBudgetUsdCents?: number;
  /** AAAA-MM-JJ, interprété dans le fuseau du compte publicitaire. */
  endDate?: string;
}

/** Identifiants chez la plateforme (colonnes `meta_*` de `campaigns` et `ads`). */
export interface PlatformCampaignRefs {
  campaignId: string;
  adsetId: string | null;
  adId: string | null;
  creativeId: string | null;
  /** Compte publicitaire, nécessaire pour lire le fuseau (modification de la date de fin). */
  adAccountId?: string;
}

export interface PlatformStatus {
  /** Valeur de l'énumération `campaign_status` de la base. */
  status: 'in_review' | 'active' | 'paused' | 'rejected' | 'ended' | 'error';
  /** Statut effectif brut de la plateforme, pour le diagnostic. */
  rawStatus: string;
}

export interface DailyStats {
  date: string;
  spendUsdCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  resultType: string | null;
  cpmUsdCents: number | null;
  ctr: number | null;
  frequency: number | null;
}

export interface PlatformRejection {
  reason: string;
  /** Identifiant de la publicité refusée chez la plateforme. */
  adId: string | null;
}

export interface PlatformConnector {
  readonly platform: Platform;
  /** Faux pour google et tiktok (« bientôt »). */
  readonly available: boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<PlatformToken>;
  listAdAccounts(token: PlatformToken): Promise<PlatformAdAccount[]>;
  listPages(token: PlatformToken): Promise<PlatformPage[]>;
  healthCheck(
    token: PlatformToken,
    adAccountId: string,
    pageId: string,
  ): Promise<HealthCheckItem[]>;
  createCampaign(token: PlatformToken, spec: PublishSpec): Promise<PlatformCampaignRefs>;
  updateCampaign(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
    patch: PublishPatch,
  ): Promise<void>;
  pause(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void>;
  resume(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void>;
  /** Supprime chez la plateforme (campagne et création) ; faux si rien à supprimer. */
  deleteCampaign(token: PlatformToken, refs: PlatformCampaignRefs): Promise<boolean>;
  getStatus(token: PlatformToken, refs: PlatformCampaignRefs): Promise<PlatformStatus>;
  fetchStats(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
    range: DateRange,
  ): Promise<DailyStats[]>;
  fetchRejection(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
  ): Promise<PlatformRejection | null>;
}
