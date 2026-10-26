// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/rejections : refus de Meta de la campagne et leur rapport.
// Lecture seule, tout membre ; filtrée par espace (une campagne d'un autre espace est introuvable, 404).
import { listRejections } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await listRejections(ctx, campaignIdParam(params)),
}));
