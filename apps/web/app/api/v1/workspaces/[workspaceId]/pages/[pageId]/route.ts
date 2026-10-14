// PATCH /api/v1/workspaces/{workspaceId}/pages/{pageId} : activer une Page (propriétaire, dans la
// limite de la formule) ou régler la langue et le ton des pubs (propriétaire ou éditeur).
import { updatePage } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { pageIdParam } from '../../../../meta/params';
import { PageUpdateSchema } from '../../../../meta/schemas';

export const PATCH = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: PageUpdateSchema,
  },
  async (ctx, { body, params }) => ({
    status: 200,
    body: await updatePage(ctx, pageIdParam(params), body),
  }),
);
