// Connecteur Meta : implémentation de `PlatformConnector` (LLD §6.14) au-dessus des modules portés d'AdFacile.
// Toute erreur est convertie en `AppError` (`toAppError`) ; le message d'origine part dans `cause`.
// Aucune relance automatique : un résultat incertain n'est jamais rejoué (SECURITY_NOTES EC-META-05).
// Documentation : https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
//                 https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
//                 https://developers.facebook.com/docs/marketing-api/insights
//                 https://developers.facebook.com/docs/marketing-api/reference/adgroup (effective_status)
import { z } from 'zod';
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
import {
  actId,
  getConnectedInstagramAccount,
  getConnectedWhatsAppAccount,
  getGrantedPermissions,
  getPixelsOverview,
  getUserPages,
  listAdAccountsWithPixels,
} from './accounts';
import { deleteCampaignOnMeta, patchCampaign, updateCampaignStatus } from './campaign-actions';
import { createFullCampaign } from './create-campaign';
import { toAppError } from './errors';
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
  upload?: UploadOptions | undefined;
  /** Taux FCFA pour 1 $ (messages de budget minimum). */
  xafPerUsd?: number | undefined;
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
    return this.run(() => getUserPages(this.graph, token.accessToken));
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

      const instagram = await getConnectedInstagramAccount(this.graph, pageId, t);
      items.push(
        instagram
          ? { key: 'instagram', status: 'ok', detail: { id: instagram.id } }
          : { key: 'instagram', status: 'missing' },
      );

      const whatsapp = await getConnectedWhatsAppAccount(this.graph, pageId, t);
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
          ...(this.config.upload ? { upload: this.config.upload } : {}),
          ...(this.config.onStep ? { onStep: this.config.onStep } : {}),
          ...(this.config.xafPerUsd === undefined ? {} : { xafPerUsd: this.config.xafPerUsd }),
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
    return this.run(() =>
      patchCampaign(this.graph, token.accessToken, refs, patch, this.config.xafPerUsd),
    );
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
