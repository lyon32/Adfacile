// GET /api/v1/workspaces/{workspaceId}/members : membres de l'espace (tout membre).
import { listMembers } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: { data: await listMembers(ctx) },
}));
