// GET /api/v1/workspaces/{workspaceId}/ad-accounts : comptes publicitaires (tout membre).
import { listAdAccounts } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: { data: await listAdAccounts(ctx) },
}));
