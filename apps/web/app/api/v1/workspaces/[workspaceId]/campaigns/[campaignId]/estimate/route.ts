// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/estimate : estimation de portée de META (estimation de diffusion).
// Jamais un chiffre de Pubeka : sans réponse exploitable de Meta, `status: unavailable` et aucune audience (PRD F6). Lecture seule,
// tout membre, rien n'est créé chez Meta.
import { getReachEstimate } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';
import { controlDeps } from '../../../../../campaigns/services';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await getReachEstimate(ctx, campaignIdParam(params), controlDeps()),
}));
