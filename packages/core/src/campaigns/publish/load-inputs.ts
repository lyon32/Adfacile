// Lecture, côté SERVEUR, de tout ce dont la publication dépend : Page, compte publicitaire, connexion Meta, fiche du commerce
// et visuel. Rien ne vient du navigateur (SECURITY_NOTES §3.2) ; chaque lecture est filtrée par `workspace_id`, même quand
// la RLS le fait déjà. Utilisé par la route (avant de dépenser quoi que ce soit) et par la tâche (juste avant d'appeler Meta).
import { AppError } from '@pubeka/contracts';
import type { DbClient } from '@pubeka/db';
import { effectiveStatus, type ConnectionStatus } from '../../meta/view';
import type { CampaignRow } from '../campaign-view';

export interface PageInfo {
  id: string;
  metaPageId: string;
  name: string | null;
  active: boolean;
  instagramAccountId: string | null;
  whatsappLinked: boolean;
  whatsappNumber: string | null;
  pixelIds: string[];
}

export interface AdAccountInfo {
  id: string;
  name: string | null;
  metaAdAccountId: string;
  currency: string | null;
  hasPaymentMethod: boolean | null;
  connectionId: string;
}

export interface ConnectionInfo {
  id: string;
  status: ConnectionStatus;
  expiresAt: Date | null;
}

export interface VisualInfo {
  sourceId: string;
  bucket: 'sources';
  filePath: string;
  expiresAt: Date | null;
}

export interface BusinessInfo {
  website: string | null;
}

export interface PublishInputs {
  page: PageInfo | null;
  adAccount: AdAccountInfo | null;
  connection: ConnectionInfo | null;
  business: BusinessInfo;
  visual: VisualInfo | null;
}

function db(error: unknown): AppError {
  return new AppError('internal_error', { cause: error });
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function connectionStatusOf(value: string): ConnectionStatus {
  return value === 'expired' || value === 'revoked' || value === 'expiring' ? value : 'ok';
}

async function loadPage(
  reader: DbClient,
  workspaceId: string,
  pageId: string | null,
): Promise<PageInfo | null> {
  if (pageId === null) return null;
  const found = await reader
    .from('pages')
    .select(
      'id, meta_page_id, name, active, instagram_account_id, whatsapp_linked, whatsapp_number, pixel_ids',
    )
    .eq('workspace_id', workspaceId)
    .eq('id', pageId)
    .maybeSingle();
  if (found.error !== null) throw db(found.error);
  const row = found.data;
  if (row === null) return null;
  return {
    id: row.id,
    metaPageId: row.meta_page_id,
    name: row.name,
    active: row.active,
    instagramAccountId: row.instagram_account_id,
    whatsappLinked: row.whatsapp_linked,
    whatsappNumber: row.whatsapp_number,
    pixelIds: row.pixel_ids,
  };
}

async function loadAdAccount(
  reader: DbClient,
  workspaceId: string,
  adAccountId: string | null,
): Promise<AdAccountInfo | null> {
  if (adAccountId === null) return null;
  const found = await reader
    .from('ad_accounts')
    .select('id, name, meta_ad_account_id, currency, has_payment_method, meta_connection_id')
    .eq('workspace_id', workspaceId)
    .eq('id', adAccountId)
    .maybeSingle();
  if (found.error !== null) throw db(found.error);
  const row = found.data;
  if (row === null) return null;
  return {
    id: row.id,
    name: row.name,
    metaAdAccountId: row.meta_ad_account_id,
    currency: str(row.currency),
    hasPaymentMethod: row.has_payment_method,
    connectionId: row.meta_connection_id,
  };
}

async function loadConnection(
  reader: DbClient,
  workspaceId: string,
  connectionId: string,
  now: Date,
): Promise<ConnectionInfo | null> {
  const found = await reader
    .from('meta_connections')
    .select('id, status, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('id', connectionId)
    .maybeSingle();
  if (found.error !== null) throw db(found.error);
  const row = found.data;
  if (row === null) return null;
  return {
    id: row.id,
    status: effectiveStatus(connectionStatusOf(row.status), row.expires_at, now),
    expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
  };
}

/** Adresse du site de la fiche du commerce (`contacts.website`), la destination d'une pub vers un site. */
async function loadBusiness(
  reader: DbClient,
  workspaceId: string,
  analysisId: string | null,
): Promise<{ business: BusinessInfo; sourceIds: string[] }> {
  const empty = { business: { website: null }, sourceIds: [] };
  if (analysisId === null) return empty;
  const analysis = await reader
    .from('analyses')
    .select('business_profile_id, source_ids')
    .eq('workspace_id', workspaceId)
    .eq('id', analysisId)
    .maybeSingle();
  if (analysis.error !== null) throw db(analysis.error);
  if (analysis.data === null) return empty;
  const sourceIds = analysis.data.source_ids;
  if (analysis.data.business_profile_id === null) return { business: { website: null }, sourceIds };
  const profile = await reader
    .from('business_profiles')
    .select('profile')
    .eq('workspace_id', workspaceId)
    .eq('id', analysis.data.business_profile_id)
    .maybeSingle();
  if (profile.error !== null) throw db(profile.error);
  const raw: unknown = profile.data?.profile;
  const contacts: unknown =
    typeof raw === 'object' && raw !== null && 'contacts' in raw ? raw.contacts : null;
  const website: unknown =
    typeof contacts === 'object' && contacts !== null && 'website' in contacts
      ? contacts.website
      : null;
  return { business: { website: str(website) }, sourceIds };
}

/**
 * Visuel de la pub tant que l'étape « Visuel » (S23) n'existe pas : la première PHOTO téléversée à l'étape Sources de l'analyse
 * (déjà ré-encodée, sans EXIF, S14). Voir le rapport de S16 : choix à confirmer quand S23 livrera les visuels.
 */
async function loadVisual(
  reader: DbClient,
  workspaceId: string,
  sourceIds: string[],
): Promise<VisualInfo | null> {
  if (sourceIds.length === 0) return null;
  const sources = await reader
    .from('sources')
    .select('id, file_path, expires_at, created_at')
    .eq('workspace_id', workspaceId)
    .in('id', sourceIds)
    .eq('type', 'image')
    .eq('status', 'ok')
    .order('created_at', { ascending: true });
  if (sources.error !== null) throw db(sources.error);
  for (const source of sources.data) {
    const path = str(source.file_path);
    if (path === null) continue;
    return {
      sourceId: source.id,
      bucket: 'sources',
      filePath: path,
      expiresAt: source.expires_at === null ? null : new Date(source.expires_at),
    };
  }
  return null;
}

export async function loadPublishInputs(
  reader: DbClient,
  workspaceId: string,
  row: Pick<CampaignRow, 'page_id' | 'ad_account_id' | 'analysis_id'>,
  now: Date,
): Promise<PublishInputs> {
  const [page, adAccount, businessAndSources] = await Promise.all([
    loadPage(reader, workspaceId, row.page_id),
    loadAdAccount(reader, workspaceId, row.ad_account_id),
    loadBusiness(reader, workspaceId, row.analysis_id),
  ]);
  const connection =
    adAccount === null
      ? null
      : await loadConnection(reader, workspaceId, adAccount.connectionId, now);
  const visual = await loadVisual(reader, workspaceId, businessAndSources.sourceIds);
  return { page, adAccount, connection, business: businessAndSources.business, visual };
}
