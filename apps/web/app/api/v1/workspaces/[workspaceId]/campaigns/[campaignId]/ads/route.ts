// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/ads : onglet « Pubs » (APPFLOW §11.3). Lecture seule, tout membre.
import { listCampaignAds } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await listCampaignAds(ctx, campaignIdParam(params)),
}));
