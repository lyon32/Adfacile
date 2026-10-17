// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/pause : met la campagne en pause chez Meta puis dans Pubeka.
// Propriétaire ou éditeur. Volontairement SANS `writable` : la pause reste permise en lecture seule et suspendue (SECURITY_NOTES
// §2.1, EC-CAMP-09), pour que le client puisse toujours arrêter de dépenser. Meta d'abord : pas de faux succès (EC-META-07).
import { pauseCampaign } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';
import { controlDeps } from '../../../../../campaigns/services';

export const POST = api(
  { auth: 'member', roles: ['owner', 'editor'], rateLimit: 'write' },
  async (ctx, { params }) => ({
    status: 200,
    body: await pauseCampaign(ctx, campaignIdParam(params), controlDeps()),
  }),
);
