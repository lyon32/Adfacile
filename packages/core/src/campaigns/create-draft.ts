// POST /workspaces/{ws}/campaigns : crée un brouillon à partir d'une analyse prête (APPFLOW §8.3). Aucun appel IA, aucune
// dépense : la campagne naît en `draft` et la base refuse tout autre statut à la création (garde, migration 0010).
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import {
  CAMPAIGN_COLUMNS,
  getCampaign,
  type CampaignRow,
  type CampaignView,
} from './campaign-view';

export interface CreateDraftInput {
  analysis_id: string;
  page_id: string;
  platform: 'meta';
}

const MAX_NAME = 200;

function defaultName(businessName: string | null, locale: 'fr' | 'en'): string {
  const fallback = locale === 'en' ? 'New campaign' : 'Nouvelle campagne';
  const name = businessName?.trim() ?? '';
  return (name === '' ? fallback : `${fallback} · ${name}`).slice(0, MAX_NAME);
}

function businessNameOf(profile: unknown): string | null {
  if (typeof profile !== 'object' || profile === null) return null;
  const name: unknown = (profile as Record<string, unknown>).business_name;
  if (typeof name !== 'object' || name === null) return null;
  const value: unknown = (name as Record<string, unknown>).value;
  return typeof value === 'string' ? value : null;
}

export async function createDraft(ctx: MemberCtx, input: CreateDraftInput): Promise<CampaignView> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const workspaceId = ctx.workspace.id;

  // L'analyse et la Page doivent appartenir à CET espace : sinon 404 (on ne confirme rien d'un autre espace).
  const analysis = await ctx.db
    .from('analyses')
    .select('id, status, business_profile_id')
    .eq('workspace_id', workspaceId)
    .eq('id', input.analysis_id)
    .maybeSingle();
  if (analysis.error !== null) throw new AppError('internal_error', { cause: analysis.error });
  if (analysis.data === null) throw new AppError('not_found');

  const page = await ctx.db
    .from('pages')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('id', input.page_id)
    .maybeSingle();
  if (page.error !== null) throw new AppError('internal_error', { cause: page.error });
  if (page.data === null) throw new AppError('not_found');

  // Les questions doivent avoir reçu leurs réponses : le Stratège travaille sur la fiche ET les réponses.
  if (analysis.data.status !== 'ready' || analysis.data.business_profile_id === null) {
    throw new AppError('conflict', { meta: { reason: 'analysis_not_ready' } });
  }

  const profile = await ctx.db
    .from('business_profiles')
    .select('profile')
    .eq('workspace_id', workspaceId)
    .eq('id', analysis.data.business_profile_id)
    .maybeSingle();
  if (profile.error !== null) throw new AppError('internal_error', { cause: profile.error });

  // Compte publicitaire actif (facultatif : on peut préparer sans Meta, APPFLOW §8.0).
  const account = await ctx.db
    .from('ad_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();
  if (account.error !== null) throw new AppError('internal_error', { cause: account.error });

  const inserted = await ctx.svc
    .from('campaigns')
    .insert({
      workspace_id: workspaceId,
      page_id: input.page_id,
      ad_account_id: account.data?.id ?? null,
      analysis_id: input.analysis_id,
      created_by: ctx.user.id,
      platform: input.platform,
      name: defaultName(businessNameOf(profile.data?.profile), ctx.user.locale),
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (inserted.error !== null) throw new AppError('internal_error', { cause: inserted.error });
  const row = inserted.data as CampaignRow;
  return getCampaign(ctx, row.id);
}
