// GET /api/v1/workspaces/{workspaceId}/pages : Pages Facebook de l'espace (tout membre).
import { listPages } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: await listPages(ctx),
}));
