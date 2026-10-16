// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/proposals/{version}/choose : retient une proposition
// (copiée dans le brouillon, revalidée par le serveur). Propriétaire ou éditeur, espace modifiable.
import { chooseProposal } from '@pubeka/core';
import { api } from '../../../../../../../../../../server/http/routes';
import { campaignIdParam, proposalVersionParam } from '../../../../../../../campaigns/params';

export const POST = api(
  { auth: 'member', roles: ['owner', 'editor'], writable: true, rateLimit: 'write' },
  async (ctx, { params }) => ({
    status: 200,
    body: await chooseProposal(ctx, campaignIdParam(params), proposalVersionParam(params)),
  }),
);
