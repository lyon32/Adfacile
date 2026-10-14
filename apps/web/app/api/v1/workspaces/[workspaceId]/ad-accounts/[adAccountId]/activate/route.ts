// POST /api/v1/workspaces/{workspaceId}/ad-accounts/{adAccountId}/activate : choisir le compte
// publicitaire actif (propriétaire, espace modifiable).
import { activateAdAccount } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { adAccountIdParam } from '../../../../../meta/params';

export const POST = api(
  { auth: 'member', roles: ['owner'], writable: true, rateLimit: 'write' },
  async (ctx, { params }) => ({
    status: 200,
    body: await activateAdAccount(ctx, adAccountIdParam(params)),
  }),
);
