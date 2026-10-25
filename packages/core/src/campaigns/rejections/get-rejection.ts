// Lecture des refus d'une campagne (tout membre). Filtrée par espace ET par campagne : un refus d'un autre espace est
// introuvable (404, jamais 403).
import { AppError } from '@pubeka/contracts';
import type { MemberCtx } from '../../context';
import { loadPublishRow } from '../publish/publish-row';
import {
  loadRejectionRow,
  loadVariants,
  REJECTION_COLUMNS,
  toRejectionRow,
  toRejectionView,
  type RejectionView,
} from './rejection-view';

const MAX_LIST = 50;

export async function getRejection(
  ctx: MemberCtx,
  campaignId: string,
  rejectionId: string,
): Promise<RejectionView> {
  const campaign = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  const row = await loadRejectionRow(ctx.db, ctx.workspace.id, campaignId, rejectionId);
  const variants = await loadVariants(ctx.db, ctx.workspace.id, campaignId);
  return toRejectionView(row, {
    campaignStatus: campaign.status,
    variant: row.ad_id === null ? null : (variants.get(row.ad_id) ?? null),
  });
}

export async function listRejections(
  ctx: MemberCtx,
  campaignId: string,
): Promise<{ data: RejectionView[] }> {
  const campaign = await loadPublishRow(ctx.db, ctx.workspace.id, campaignId);
  const found = await ctx.db
    .from('rejections')
    .select(REJECTION_COLUMNS)
    .eq('workspace_id', ctx.workspace.id)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(MAX_LIST);
  if (found.error !== null) throw new AppError('internal_error', { cause: found.error });
  const variants = await loadVariants(ctx.db, ctx.workspace.id, campaignId);
  return {
    data: found.data.map((raw) => {
      const row = toRejectionRow(raw);
      return toRejectionView(row, {
        campaignStatus: campaign.status,
        variant: row.ad_id === null ? null : (variants.get(row.ad_id) ?? null),
      });
    }),
  };
}
