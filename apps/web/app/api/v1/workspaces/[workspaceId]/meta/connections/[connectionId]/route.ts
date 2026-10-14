// DELETE /api/v1/workspaces/{workspaceId}/meta/connections/{connectionId} : déconnecter Meta
// (propriétaire, espace modifiable ; EC-META-02 : les campagnes publiées restent chez Meta).
import { disconnectMeta } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { connectionIdParam } from '../../../../../meta/params';

export const DELETE = api(
  { auth: 'member', roles: ['owner'], writable: true, rateLimit: 'write' },
  async (ctx, { params }) => {
    await disconnectMeta(ctx, connectionIdParam(params));
    return { status: 204 };
  },
);
