// Lectures de la page de campagne et de la liste (S17) : liste des campagnes, historique (onglet « Historique »), publicités
// (onglet « Pubs »). Lecture seule, tout membre ; chaque requête filtre par `workspace_id` (404 pour une campagne d'un autre espace).
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { MemberCtx } from '../../context';
import { isCampaignStatus } from '../campaign-state';
import {
  CAMPAIGN_COLUMNS,
  loadCampaignRow,
  toCampaignView,
  type CampaignView,
} from '../campaign-view';
import { loadCostContext } from '../cost-context';
import { loadPublishInputs } from '../publish/load-inputs';

// ---- Liste ------------------------------------------------------------------------------------------------------------

export const LIST_DEFAULT_LIMIT = 25;
export const LIST_MAX_LIMIT = 100;

export interface ListCampaignsInput {
  status?: string | undefined;
  pageId?: string | undefined;
  /** Seulement les campagnes mises en pause par le verrouillage (S19b : bouton « Reprendre mes pubs »). */
  pauseReason?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface CampaignListView {
  data: CampaignView[];
  next_cursor: string | null;
}

function badRequest(field: string, code: string, message: string): AppError {
  return new AppError('validation_failed', { errors: [{ field, code, message }] });
}

/** Clé de reprise d'une liste : la dernière ligne lue, sur (created_at, id) pour ne sauter aucune ligne créée au même instant. */
export interface ListCursorKey {
  created_at: string;
  id: string;
}

/**
 * Scelle et ouvre les curseurs. Le vrai codec (apps/web) signe avec `APP_SIGNING_SECRET` (HMAC-SHA256, comparaison en temps constant,
 * API_SPEC §8) : `open` renvoie `null` pour tout curseur qui n'a pas été scellé par le serveur (falsifié, modifié, d'une autre sorte).
 */
export interface ListCursorCodec {
  seal(key: ListCursorKey): string;
  open(token: string): ListCursorKey | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Curseur falsifié ou illisible : 400 `validation_failed` sur le champ `cursor` (code de la liste fermée d'API_SPEC §4). */
function decodeCursor(cursor: string, codec: ListCursorCodec): ListCursorKey {
  const key = codec.open(cursor);
  if (key === null || Number.isNaN(Date.parse(key.created_at)) || !UUID.test(key.id)) {
    throw badRequest('cursor', 'invalid_cursor', 'Curseur invalide');
  }
  return key;
}

export async function listCampaigns(
  ctx: MemberCtx,
  input: ListCampaignsInput,
  codec: ListCursorCodec,
): Promise<CampaignListView> {
  const limit = input.limit ?? LIST_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX_LIMIT) {
    throw badRequest('limit', 'out_of_range', `Entier de 1 à ${String(LIST_MAX_LIMIT)} attendu`);
  }
  if (input.status !== undefined && !isCampaignStatus(input.status)) {
    throw badRequest('status', 'invalid_value', 'Statut inconnu');
  }
  if (input.pauseReason !== undefined && input.pauseReason !== 'billing_lock') {
    throw badRequest('pause_reason', 'invalid_value', 'Motif inconnu');
  }
  const status = input.status;
  const pauseReason = input.pauseReason;
  const pageId = input.pageId;
  const key = input.cursor === undefined ? null : decodeCursor(input.cursor, codec);
  const base = () => {
    let query = ctx.db
      .from('campaigns')
      .select(`${CAMPAIGN_COLUMNS}, created_at`)
      .eq('workspace_id', ctx.workspace.id);
    if (status !== undefined) query = query.eq('status', status);
    if (pageId !== undefined) query = query.eq('page_id', pageId);
    if (pauseReason !== undefined) query = query.eq('pause_reason', pauseReason);
    return query;
  };
  const newest = (query: ReturnType<typeof base>, count: number) =>
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(count);

  // Reprise par la clé (created_at, id) : d'abord les lignes du MÊME instant avec un identifiant plus petit, puis les plus anciennes.
  let rows = unwrap(
    await newest(
      key === null ? base() : base().eq('created_at', key.created_at).lt('id', key.id),
      limit + 1,
    ),
  );
  if (key !== null && rows.length < limit + 1) {
    const older = unwrap(
      await newest(base().lt('created_at', key.created_at), limit + 1 - rows.length),
    );
    rows = [...rows, ...older];
  }
  const page = rows.slice(0, limit);
  const costContext = await loadCostContext(ctx);
  const last = page[page.length - 1];
  return {
    data: page.map((row) => toCampaignView(row, costContext)),
    next_cursor:
      rows.length > limit && last !== undefined
        ? codec.seal({ created_at: last.created_at, id: last.id })
        : null,
  };
}

// ---- Historique -------------------------------------------------------------------------------------------------------

export interface CampaignEventView {
  id: number;
  created_at: string;
  /** Nouveau statut (`active`, `paused`…), ou `meta_status` / `in_process` / `with_issues` pour un signal de Meta. */
  status: string;
  source: 'webhook' | 'poll' | 'user';
  detail: { raw_status?: string; event?: string; reason?: string; from?: string };
}

const EVENT_LIMIT = 50;

function detailOf(payload: unknown): CampaignEventView['detail'] {
  const detail: CampaignEventView['detail'] = {};
  if (typeof payload !== 'object' || payload === null) return detail;
  // Liste blanche : rien d'autre que ces champs courts ne sort vers l'écran.
  for (const key of ['raw_status', 'event', 'reason', 'from'] as const) {
    const value: unknown = key in payload ? Reflect.get(payload, key) : undefined;
    if (typeof value === 'string' && value.length <= 100) detail[key] = value;
  }
  return detail;
}

function sourceOf(value: string): CampaignEventView['source'] {
  return value === 'webhook' || value === 'poll' ? value : 'user';
}

export async function listCampaignEvents(
  ctx: MemberCtx,
  campaignId: string,
): Promise<{ data: CampaignEventView[] }> {
  await loadCampaignRow(ctx, campaignId);
  const rows = unwrap<
    { id: number; created_at: string; status: string; source: string; payload: unknown }[]
  >(
    await ctx.db
      .from('campaign_status_events')
      .select('id, created_at, status, source, payload')
      .eq('workspace_id', ctx.workspace.id)
      .eq('campaign_id', campaignId)
      .order('id', { ascending: false })
      .limit(EVENT_LIMIT),
  );
  return {
    data: rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      status: row.status,
      source: sourceOf(row.source),
      detail: detailOf(row.payload),
    })),
  };
}

// ---- Publicités -------------------------------------------------------------------------------------------------------

export interface CampaignAdView {
  id: string;
  format: string | null;
  variant: 'A' | 'B' | null;
  status: string | null;
  /** Adresse signée (15 minutes) de la photo utilisée comme visuel tant que l'étape Visuel (S23) n'existe pas. */
  photo_url: string | null;
}

const PHOTO_TTL_S = 900;

export async function listCampaignAds(
  ctx: MemberCtx,
  campaignId: string,
): Promise<{ data: CampaignAdView[]; ab_test: boolean }> {
  const campaign = await loadCampaignRow(ctx, campaignId);
  const ads = unwrap<
    { id: string; format: string | null; variant: string | null; status: string | null }[]
  >(
    await ctx.db
      .from('ads')
      .select('id, format, variant, status')
      .eq('workspace_id', ctx.workspace.id)
      .eq('campaign_id', campaignId)
      .order('id', { ascending: true }),
  );
  let photoUrl: string | null = null;
  if (ads.length > 0) {
    const inputs = await loadPublishInputs(ctx.db, ctx.workspace.id, campaign, ctx.now());
    if (inputs.visual !== null) {
      const signed = await ctx.svc.storage
        .from(inputs.visual.bucket)
        .createSignedUrl(inputs.visual.filePath, PHOTO_TTL_S);
      photoUrl = signed.error === null ? signed.data.signedUrl : null;
    }
  }
  return {
    data: ads.map((ad) => ({
      id: ad.id,
      format: ad.format,
      variant: ad.variant === 'A' || ad.variant === 'B' ? ad.variant : null,
      status: ad.status,
      photo_url: photoUrl,
    })),
    ab_test: campaign.ab_test,
  };
}
