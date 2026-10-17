// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/readiness : ce qu'il faut savoir avant de publier (photo signée,
// clause de responsabilité, état de Meta, Page, rayon réel des villes). Lecture seule, tout membre.
import { getPublicationReadiness } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await getPublicationReadiness(ctx, campaignIdParam(params)),
}));
