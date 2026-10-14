// GET /api/v1/workspaces/{workspaceId}/meta/connections : connexions Meta, sans jeton (tout membre).
import { listMetaConnections } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: { data: await listMetaConnections(ctx) },
}));
