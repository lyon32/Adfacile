// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId} : détail (tout membre).
// PATCH : modification d'un brouillon, `version` obligatoire (EC-TEAM-08) ; périmée → 409 `conflict`.
import { getCampaign, updateCampaign } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../campaigns/params';
import { updateCampaignSchema } from '../../../../campaigns/schemas';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await getCampaign(ctx, campaignIdParam(params)),
}));

export const PATCH = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: updateCampaignSchema,
  },
  async (ctx, { body, params }) => ({
    status: 200,
    body: await updateCampaign(ctx, campaignIdParam(params), body),
  }),
);
