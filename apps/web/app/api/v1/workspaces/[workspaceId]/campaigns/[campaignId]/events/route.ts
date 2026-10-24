// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/events : onglet « Historique » (APPFLOW §11.3). Lecture seule, tout membre.
import { listCampaignEvents } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await listCampaignEvents(ctx, campaignIdParam(params)),
}));
