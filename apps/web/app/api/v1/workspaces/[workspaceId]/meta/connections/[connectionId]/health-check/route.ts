// POST /api/v1/workspaces/{workspaceId}/meta/connections/{connectionId}/health-check : bilan de
// santé (F1). Relit les comptes et les Pages chez Meta ; propriétaire, espace modifiable.
import { runMetaHealthCheck } from '@pubeka/core';
import { api } from '../../../../../../../../../server/http/routes';
import { connectionIdParam } from '../../../../../../meta/params';
import { metaDeps } from '../../../../../../meta/meta-services';

export const POST = api(
  { auth: 'member', roles: ['owner'], writable: true, rateLimit: 'write' },
  async (ctx, { params }) => ({
    status: 200,
    body: await runMetaHealthCheck(ctx, connectionIdParam(params), metaDeps()),
  }),
);
