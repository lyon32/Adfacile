// GET  /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/proposals : propositions terminées (tout membre).
// POST : génère UNE proposition (Stratège). Action qui dépense un appel IA : `Idempotency-Key` obligatoire, limite « ai »
// (20 par heure et par espace), propriétaire ou éditeur. L'idempotence est tenue par la ligne réservée en base
// (`generateProposal`), pas par `api()` : une réponse en flux ne peut pas être rejouée.
import { generateProposal, listProposals } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam, idempotencyKeyOf } from '../../../../../campaigns/params';
import { proposalDeps } from '../../../../../campaigns/services';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: { data: await listProposals(ctx, campaignIdParam(params)) },
}));

export const POST = api(
  { auth: 'member', roles: ['owner', 'editor'], writable: true, rateLimit: 'ai' },
  async (ctx, { params, headers }) => {
    const idempotencyKey = idempotencyKeyOf(headers);
    const proposal = await generateProposal(
      ctx,
      campaignIdParam(params),
      { idempotencyKey },
      proposalDeps(),
    );
    return { status: 201, body: proposal };
  },
);
