// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/resume : reprend une campagne en pause. Propriétaire ou éditeur,
// espace modifiable, Page dans la formule (EC-CAMP-09). Meta d'abord.
import { resumeCampaign } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';
import { controlDeps } from '../../../../../campaigns/services';

export const POST = api(
  { auth: 'member', roles: ['owner', 'editor'], writable: true, rateLimit: 'write' },
  async (ctx, { params }) => ({
    status: 200,
    body: await resumeCampaign(ctx, campaignIdParam(params), controlDeps()),
  }),
);
