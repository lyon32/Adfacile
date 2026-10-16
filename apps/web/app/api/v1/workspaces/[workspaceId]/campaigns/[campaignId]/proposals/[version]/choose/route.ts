// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/proposals/{version}/choose : retient une proposition
// (copiée dans le brouillon, revalidée par le serveur). Propriétaire ou éditeur, espace modifiable.
// Le corps porte la `version` du brouillon lue par le client : périmée → 409 `conflict` (EC-TEAM-08).
import { chooseProposal } from '@pubeka/core';
import { api } from '../../../../../../../../../../server/http/routes';
import { campaignIdParam, proposalVersionParam } from '../../../../../../../campaigns/params';
import { chooseProposalSchema } from '../../../../../../../campaigns/schemas';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: chooseProposalSchema,
  },
  async (ctx, { body, params }) => ({
    status: 200,
    body: await chooseProposal(
      ctx,
      campaignIdParam(params),
      proposalVersionParam(params),
      body.version,
    ),
  }),
);
