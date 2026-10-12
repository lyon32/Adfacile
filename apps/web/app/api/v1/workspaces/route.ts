// GET /api/v1/workspaces : espaces dont l'utilisateur est membre.
import { listWorkspaces } from '@pubeka/core';
import { api } from '../../../../server/http/routes';

export const GET = api({ auth: 'user', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: { data: await listWorkspaces(ctx) },
}));
