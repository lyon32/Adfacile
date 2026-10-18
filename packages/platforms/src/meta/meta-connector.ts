// Connecteur Meta : implémentation de `PlatformConnector` (LLD §6.14) au-dessus des modules portés d'AdFacile.
// Toute erreur est convertie en `AppError` (`toAppError`) ; le message d'origine part dans `cause`.
// Aucune relance automatique : un résultat incertain n'est jamais rejoué (SECURITY_NOTES EC-META-05).
// Documentation : https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
//                 https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
//                 https://developers.facebook.com/docs/marketing-api/insights
//                 https://developers.facebook.com/docs/marketing-api/reference/adgroup (effective_status)
import { AppError } from '@pubeka/contracts';
import { z } from 'zod';
import type {
  DailyStats,
  DateRange,
  CampaignLookup,
  DeliveryEstimate,
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
  RemoteCampaign,
  PublishSpec,
} from '../types';
import {
  actId,
  getConnectedInstagramAccount,
  getWhatsAppAccounts,
  getGrantedPermissions,
  getPixelsOverview,
  getUserPages,
  pageTokenOrUser,
  listAdAccountsWithPixels,
} from './accounts';
import { deleteCampaignOnMeta, patchCampaign, updateCampaignStatus } from './campaign-actions';
import { createFullCampaign, normalizeObjective } from './create-campaign';
import { buildPromotedObject, resolveDestination } from './destination';
import { buildTargeting } from './targeting';
import { assertMediaHostsConfigured } from './ssrf';
import { MetaValidationError, toAppError } from './errors';
import { MIN_REFERENCE_LENGTH, nameHasReference } from './reference-match';
import { GraphClient, type FetchLike } from './graph';
import type { UploadOptions } from './media-upload';

/**
 * Permissions demandées à la connexion. Retirées volontairement : pages_manage_ads et leads_retrieval
 * (aucun appel /leadgen_forms ni /leads) et instagram_manage_insights (jamais appelée) — demander ce
 * qu'on n'utilise pas est un motif de refus à la revue Meta.
 */
export const META_SCOPES: readonly string[] = [
  'pages_show_list',
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  // Instagram : identité Instagram des publicités.
  'instagram_basic',
  // WhatsApp : numéro de la Page pour les destinations WhatsApp.
  'whatsapp_business_management',
];

export interface MetaConnectorConfig {
  appId: string;
  appSecret: string;
  /** Configuration « Facebook Login for Business » (`META_LOGIN_CONFIG_ID`) : remplace `scope`. */
  loginConfigId?: string | undefined;
  /** Version de la Graph API (`META_GRAPH_API_VERSION`), `v26.0` par défaut. */
  graphVersion?: string | undefined;
  fetch?: FetchLike | undefined;
  /** L'heure (`ctx.now()`). */
  now: () => Date;
  /**
   * Hôtes des médias que le serveur peut télécharger (le stockage de Pubeka) : OBLIGATOIRE et non vide
   * (anti-SSRF). Le connecteur refuse de démarrer sans elle.
   */
  allowedMediaHosts: readonly string[];
  /** Attente des vidéos (tests). */
  upload?: Omit<UploadOptions, 'allowedMediaHosts'> | undefined;
  onStep?: ((name: string, detail?: { current: number; total: number }) => void) | undefined;
}

const tokenSchema = z.looseObject({ access_token: z.string(), expires_in: z.number().optional() });

/** Statut effectif d'une publicité → énumération `campaign_status`. */
function mapEffectiveStatus(raw: string): PlatformStatus['status'] {
  switch (raw) {
    case 'ACTIVE':
      return 'active';
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return 'paused';
    case 'PENDING_REVIEW':
    case 'PREAPPROVED':
    case 'IN_PROCESS':
      return 'in_review';
    case 'DISAPPROVED':
      return 'rejected';
    case 'DELETED':
    case 'ARCHIVED':
      return 'stopped';
    default:
      // WITH_ISSUES, PENDING_BILLING_INFO et toute valeur inconnue : à regarder, pas à cacher.
      return 'error';
  }
}

/** « 12.34 » → 1234, sans passer par un flottant. */
export function decimalToCents(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return 0;
  const decimals = (match[3] ?? '').padEnd(3, '0');
  const cents =
    Number(match[2]) * 100 + Number(decimals.slice(0, 2)) + (Number(decimals[2]) >= 5 ? 1 : 0);
  return match[1] ? -cents : cents;
}

/** Types d'action comptés comme « résultat », du plus précieux au plus courant (Insights › actions). */
const RESULT_ACTIONS: readonly string[] = [
  'purchase',
  'omni_purchase',
  'lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'link_click',
  'post_engagement',
];

const insightsSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        date_start: z.string(),
        impressions: z.string().optional(),
        reach: z.string().optional(),
        clicks: z.string().optional(),
        spend: z.string().optional(),
        frequency: z.string().optional(),
        ctr: z.string().optional(),
        cpm: z.string().optional(),
        actions: z.array(z.looseObject({ action_type: z.string(), value: z.string() })).optional(),
      }),
    )
    .optional(),
});

const estimateSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        estimate_mau_lower_bound: z.union([z.number(), z.string()]).optional(),
        estimate_mau_upper_bound: z.union([z.number(), z.string()]).optional(),
        estimate_ready: z.boolean().optional(),
      }),
    )
    .optional(),
});

function wholeNumber(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.trim() === '' ? Number.NaN : value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Bornes valides et ordonnées, estimation prête, audience non nulle : sinon `null` (jamais un chiffre approximatif). */
function readEstimate(raw: unknown): DeliveryEstimate | null {
  const row = estimateSchema.parse(raw).data?.[0];
  if (row === undefined || row.estimate_ready === false) return null;
  const lowerBound = wholeNumber(row.estimate_mau_lower_bound);
  const upperBound = wholeNumber(row.estimate_mau_upper_bound);
  if (lowerBound === null || upperBound === null || lowerBound > upperBound || upperBound === 0)
    return null;
  return { lowerBound, upperBound };
}

const campaignListSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        name: z.string().optional(),
        effective_status: z.string().optional(),
      }),
    )
    .optional(),
  paging: z.looseObject({ next: z.string().optional() }).optional(),
});
const adListSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        adset_id: z.string().optional(),
        creative: z.looseObject({ id: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});
/** Statuts effectifs d'une campagne documentés (une campagne supprimée ou archivée n'est pas relue). */
const LOOKUP_STATUSES: readonly string[] = ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES'];
const LOOKUP_PAGE_SIZE = 100;
const MAX_LOOKUP_PAGES = 20;
const locationSearchSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        key: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        country_code: z.string().optional(),
        region: z.string().optional(),
      }),
    )
    .optional(),
});
const effectiveStatusSchema = z.looseObject({ effective_status: z.string().optional() });
const reviewSchema = z.looseObject({
  effective_status: z.string().optional(),
  ad_review_feedback: z.unknown().optional(),
});
const tokenExchangeSchema = tokenSchema;
const fundingSchema = z.looseObject({ funding_source: z.string().optional() });

const toInt = (v: string | undefined): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : 0;
};
const toNumber = (v: string | undefined): number | null => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : null;
};

/** Premier texte trouvé dans le retour de relecture (structure non documentée : lecture tolérante). */
function firstReason(feedback: unknown, depth = 0): string | null {
  if (typeof feedback === 'string') return feedback || null;
  if (depth > 4 || feedback === null || typeof feedback !== 'object') return null;
  for (const value of Object.values(feedback)) {
    const found = firstReason(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export class MetaConnector implements PlatformConnector {
  readonly platform = 'meta' as const;
  readonly available = true;
  private readonly graph: GraphClient;

  constructor(private readonly config: MetaConnectorConfig) {
    // Porté de validateFacebookConfig (backend/src/config/facebook.js) : échouer tôt, avec ce qui manque, plutôt
    // que d'envoyer à Meta une URL qu'il rejette (« Impossible de charger cette URL »). La validation de l'adresse de
    // retour (chemin, https) relève de S11, qui possède la route de callback.
    const missing = [
      ...(config.appId ? [] : ['appId']),
      ...(config.appSecret ? [] : ['appSecret']),
    ];
    if (missing.length > 0) {
      throw new AppError('internal_error', {
        cause: new Error(`Configuration Meta incomplète : ${missing.join(', ')} absent`),
      });
    }
    assertMediaHostsConfigured(config.allowedMediaHosts);
    this.graph = new GraphClient({
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(config.graphVersion ? { version: config.graphVersion } : {}),
    });
  }

  /** Enveloppe toute erreur en `AppError`. */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toAppError(error);
    }
  }

  authorizeUrl(state: string, redirectUri: string): string {
    // Facebook Login for Business : les permissions sont portées par une configuration créée dans le tableau
    // de bord Meta (config_id), qui remplace scope. Relevé du 8 oct. 2026 : l'app « Entreprise » répondait
    // « Feature Unavailable » au dialogue appelé avec scope.
    const version = this.config.graphVersion ?? 'v26.0';
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      ...(this.config.loginConfigId
        ? { config_id: this.config.loginConfigId }
        : { scope: META_SCOPES.join(',') }),
      response_type: 'code',
      state,
      auth_type: 'rerequest',
    });
    return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
  }

  /** Échange le code contre un jeton court, puis contre un jeton de longue durée (60 jours). */
  exchangeCode(code: string, redirectUri: string): Promise<PlatformToken> {
    return this.run(async () => {
      const short = tokenExchangeSchema.parse(
        await this.graph.get('oauth/access_token', {
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          redirect_uri: redirectUri,
          code,
        }),
      );
      const long = tokenExchangeSchema.parse(
        await this.graph.get('oauth/access_token', {
          grant_type: 'fb_exchange_token',
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          fb_exchange_token: short.access_token,
        }),
      );
      return {
        accessToken: long.access_token,
        expiresAt: long.expires_in
          ? new Date(this.config.now().getTime() + long.expires_in * 1000)
          : null,
      };
    });
  }

  listAdAccounts(token: PlatformToken): Promise<PlatformAdAccount[]> {
    return this.run(() => listAdAccountsWithPixels(this.graph, token.accessToken));
  }

  listPages(token: PlatformToken): Promise<PlatformPage[]> {
    // Le jeton propre de la Page ne sort jamais du connecteur.
    return this.run(async () =>
      (await getUserPages(this.graph, token.accessToken)).map(({ id, name, category }) => ({
        id,
        name,
        category,
      })),
    );
  }

  /**
   * Estimation de diffusion : `GET act_X/delivery_estimate` avec `optimization_goal` et `targeting_spec` (obligatoires) et
   * `promoted_object` (https://developers.facebook.com/docs/marketing-api/reference/ad-account/delivery_estimate/). LECTURE SEULE.
   * Les champs lus (`estimate_mau_lower_bound`, `estimate_mau_upper_bound`, `estimate_ready`) sont documentés sur le nœud frère
   * AdCampaignDeliveryEstimate ; la page du compte ne détaille pas son nœud : toute réponse qui ne les porte pas valablement
   * donne `null` (aucun chiffre n'est jamais inventé).
   */
  estimateDelivery(token: PlatformToken, spec: PublishSpec): Promise<DeliveryEstimate | null> {
    return this.run(async () => {
      const page = spec.page;
      const destination = resolveDestination(
        { ...spec, objective: normalizeObjective(spec.objective) },
        page,
      );
      const conversion = destination.isMessaging ? null : destination.conversion;
      const promoted = buildPromotedObject(
        destination.destination_type,
        page,
        destination.isMessaging ? destination.whatsapp_phone_number : null,
        destination.isMessaging ? destination.whatsapp_phone_number_id : null,
        conversion,
      );
      const raw = await this.graph.get(`${actId(spec.adAccountId)}/delivery_estimate`, {
        optimization_goal: destination.optimization_goal,
        targeting_spec: JSON.stringify(buildTargeting(spec.targeting)),
        ...(promoted === undefined ? {} : { promoted_object: JSON.stringify(promoted) }),
        access_token: token.accessToken,
      });
      return readEstimate(raw);
    });
  }

  /**
   * Cherche un lieu pour en obtenir la clé de ciblage. LECTURE SEULE.
   * Documentation : https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search (« Geo Locations »)
   * GET /search?type=adgeolocation&q=…&location_types=["city"]&country_code=XX&limit=…
   */
  searchLocations(token: PlatformToken, query: LocationQuery): Promise<LocationMatch[]> {
    return this.run(async () => {
      const raw = await this.graph.get('search', {
        type: 'adgeolocation',
        q: query.name,
        location_types: JSON.stringify([query.type]),
        limit: 10,
        access_token: token.accessToken,
        ...(query.countryCode === undefined ? {} : { country_code: query.countryCode }),
      });
      return (locationSearchSchema.parse(raw).data ?? []).flatMap((item) =>
        item.key === undefined || item.name === undefined
          ? []
          : [
              {
                key: item.key,
                name: item.name,
                type: item.type ?? query.type,
                countryCode: item.country_code ?? null,
                region: item.region ?? null,
              },
            ],
      );
    });
  }

  /** Bilan de santé (F1) : Pubeka détecte et guide, ne crée rien à la place du client. */
  healthCheck(
    token: PlatformToken,
    adAccountId: string,
    pageId: string,
  ): Promise<HealthCheckItem[]> {
    return this.run(async () => {
      const t = token.accessToken;
      const account = actId(adAccountId);
      const [accounts, pages] = await Promise.all([
        listAdAccountsWithPixels(this.graph, t),
        getUserPages(this.graph, t),
      ]);
      const items: HealthCheckItem[] = [];

      const found = accounts.find((a) => a.id === account);
      items.push(
        !found
          ? { key: 'ad_account', status: 'missing' }
          : {
              key: 'ad_account',
              status: found.usable ? 'ok' : 'warning',
              detail: { label: found.statusLabel },
            },
      );

      // Moyen de paiement : sans `funding_source`, des publicités peuvent être créées mais ne sont pas diffusées.
      const funding = await this.graph
        .get(account, { fields: 'funding_source', access_token: t })
        .then((raw) => fundingSchema.parse(raw).funding_source)
        .catch(() => undefined);
      items.push({ key: 'payment_method', status: funding ? 'ok' : 'missing' });

      items.push({ key: 'page', status: pages.some((p) => p.id === pageId) ? 'ok' : 'missing' });

      // Comme AdFacile : Instagram se cherche avec le jeton de la Page quand il existe, sinon celui de l'utilisateur.
      const page = pages.find((p) => p.id === pageId);
      const instagram = await getConnectedInstagramAccount(
        this.graph,
        pageId,
        pageTokenOrUser(page, t),
      );
      items.push(
        instagram
          ? { key: 'instagram', status: 'ok', detail: { id: instagram.id } }
          : { key: 'instagram', status: 'missing' },
      );

      // WhatsApp est lié au Business Manager, pas à la Page : recherche avec le jeton de l'utilisateur (comme AdFacile).
      const whatsapp = await getWhatsAppAccounts(this.graph, t);
      items.push(
        whatsapp
          ? { key: 'whatsapp', status: 'ok', detail: { id: whatsapp.id } }
          : { key: 'whatsapp', status: 'missing' },
      );

      const pixels = await getPixelsOverview(this.graph, account, t).catch(() => null);
      items.push(
        pixels === null || (pixels.attached.length === 0 && pixels.business_unattached.length === 0)
          ? { key: 'pixel', status: 'missing' }
          : pixels.attached.length > 0
            ? { key: 'pixel', status: 'ok', detail: { count: pixels.attached.length } }
            : {
                key: 'pixel',
                status: 'warning',
                detail: { unattached: pixels.business_unattached.length },
              },
      );

      const granted = await getGrantedPermissions(this.graph, t).catch(() => null);
      const manquantes =
        granted === null ? [...META_SCOPES] : META_SCOPES.filter((s) => !granted.includes(s));
      items.push(
        manquantes.length === 0
          ? { key: 'permissions', status: 'ok' }
          : { key: 'permissions', status: 'warning', detail: { missing: manquantes.join(',') } },
      );

      return items;
    });
  }

  createCampaign(token: PlatformToken, spec: PublishSpec): Promise<PlatformCampaignRefs> {
    return this.run(() =>
      createFullCampaign(
        {
          graph: this.graph,
          now: this.config.now,
          upload: { ...this.config.upload, allowedMediaHosts: this.config.allowedMediaHosts },
          ...(this.config.onStep ? { onStep: this.config.onStep } : {}),
        },
        token.accessToken,
        spec,
      ),
    );
  }

  updateCampaign(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
    patch: PublishPatch,
  ): Promise<void> {
    return this.run(() => patchCampaign(this.graph, token.accessToken, refs, patch));
  }

  pause(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void> {
    return this.run(async () => {
      await updateCampaignStatus(this.graph, token.accessToken, refs, 'paused');
    });
  }

  resume(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void> {
    return this.run(async () => {
      await updateCampaignStatus(this.graph, token.accessToken, refs, 'active');
    });
  }

  deleteCampaign(token: PlatformToken, refs: PlatformCampaignRefs): Promise<boolean> {
    return this.run(() => deleteCampaignOnMeta(this.graph, token.accessToken, refs));
  }

  /**
   * Rapprochement (EC-META-05) : les campagnes du compte dont le nom contient la référence de publication. LECTURE SEULE.
   * Le filtre par nom de l'arête `campaigns` n'est pas documenté : on lit la liste par pages (`fields`, `effective_status`,
   * `limit`, `paging.next` : https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/ et la pagination du
   * Graph API) et on filtre ici. Les publicités d'une campagne : arête `ads` (`id`, `adset_id`, `creative`).
   */
  findCampaignsByReference(
    token: PlatformToken,
    adAccountId: string,
    reference: string,
  ): Promise<CampaignLookup> {
    return this.run(async () => {
      const wanted = reference.trim();
      if (wanted.length < MIN_REFERENCE_LENGTH) {
        throw new MetaValidationError('La référence de publication est vide ou trop courte.');
      }
      const matches: { id: string; name: string; status: string }[] = [];
      let exhaustive = false;
      let next: string | undefined;
      for (let page = 0; page < MAX_LOOKUP_PAGES; page += 1) {
        const raw =
          next === undefined
            ? await this.graph.get(`${actId(adAccountId)}/campaigns`, {
                fields: 'id,name,effective_status',
                effective_status: JSON.stringify(LOOKUP_STATUSES),
                limit: LOOKUP_PAGE_SIZE,
                access_token: token.accessToken,
              })
            : await this.graph.get(next);
        const parsed = campaignListSchema.parse(raw);
        for (const item of parsed.data ?? []) {
          if (
            item.id !== undefined &&
            item.name !== undefined &&
            nameHasReference(item.name, wanted)
          ) {
            matches.push({
              id: item.id,
              name: item.name,
              status: item.effective_status ?? 'UNKNOWN',
            });
          }
        }
        next = parsed.paging?.next;
        if (next === undefined) {
          exhaustive = true;
          break;
        }
      }
      const campaigns: RemoteCampaign[] = [];
      for (const match of matches) {
        const ads = adListSchema.parse(
          await this.graph.get(`${match.id}/ads`, {
            fields: 'id,adset_id,creative',
            limit: 5,
            access_token: token.accessToken,
          }),
        );
        const ad = ads.data?.[0];
        campaigns.push({
          campaignId: match.id,
          name: match.name,
          effectiveStatus: match.status,
          adsetId: ad?.adset_id ?? null,
          adId: ad?.id ?? null,
          creativeId: ad?.creative?.id ?? null,
        });
      }
      return { campaigns, exhaustive };
    });
  }

  /** Statut de la publicité (le niveau qui porte la relecture) ; à défaut, celui de la campagne. */
  getStatus(token: PlatformToken, refs: PlatformCampaignRefs): Promise<PlatformStatus> {
    return this.run(async () => {
      const raw = await this.graph.get(refs.adId ?? refs.campaignId, {
        fields: 'effective_status',
        access_token: token.accessToken,
      });
      const rawStatus = effectiveStatusSchema.parse(raw).effective_status ?? 'UNKNOWN';
      return { status: mapEffectiveStatus(rawStatus), rawStatus };
    });
  }

  fetchStats(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
    range: DateRange,
  ): Promise<DailyStats[]> {
    return this.run(async () => {
      const raw = await this.graph.get(`${refs.campaignId}/insights`, {
        access_token: token.accessToken,
        fields: 'impressions,reach,clicks,spend,frequency,ctr,cpm,actions',
        time_range: JSON.stringify({ since: range.since, until: range.until }),
        time_increment: 1,
        level: 'campaign',
      });
      return (insightsSchema.parse(raw).data ?? []).map((day) => {
        const actions = new Map((day.actions ?? []).map((a) => [a.action_type, toInt(a.value)]));
        const resultType = RESULT_ACTIONS.find((type) => (actions.get(type) ?? 0) > 0) ?? null;
        const cpm = day.cpm === undefined ? null : decimalToCents(day.cpm);
        return {
          date: day.date_start,
          spendUsdCents: decimalToCents(day.spend),
          impressions: toInt(day.impressions),
          reach: toInt(day.reach),
          clicks: toInt(day.clicks),
          results: resultType ? (actions.get(resultType) ?? 0) : 0,
          resultType,
          cpmUsdCents: cpm,
          ctr: toNumber(day.ctr),
          frequency: toNumber(day.frequency),
        };
      });
    });
  }

  /** Motif du refus d'une publicité (`ad_review_feedback`), ou null si elle n'est pas refusée. */
  fetchRejection(
    token: PlatformToken,
    refs: PlatformCampaignRefs,
  ): Promise<PlatformRejection | null> {
    return this.run(async () => {
      if (!refs.adId) return null;
      const raw = await this.graph.get(refs.adId, {
        fields: 'effective_status,ad_review_feedback',
        access_token: token.accessToken,
      });
      const ad = reviewSchema.parse(raw);
      if (ad.effective_status !== 'DISAPPROVED') return null;
      return {
        reason: firstReason(ad.ad_review_feedback) ?? 'Refus sans motif communiqué par Meta.',
        adId: refs.adId,
      };
    });
  }
}
