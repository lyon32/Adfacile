// GET /api/v1/workspaces/{workspaceId}/analyses/{analysisId} : état, fiche et questions (tout membre).
import { getAnalysis } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { analysisIdParam } from '../../../../analysis/params';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await getAnalysis(ctx, analysisIdParam(params)),
}));
