// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/rejections/{rejectionId} : le rapport du Modérateur sur un refus.
// Lecture seule, tout membre ; un refus d'un autre espace ou d'une autre campagne est introuvable (404, jamais 403).
import { getRejection } from '@pubeka/core';
import { api } from '../../../../../../../../../server/http/routes';
import { campaignIdParam, rejectionIdParam } from '../../../../../../campaigns/params';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await getRejection(ctx, campaignIdParam(params), rejectionIdParam(params)),
}));
