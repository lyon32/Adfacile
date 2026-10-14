// GET et PUT /api/v1/workspaces/{workspaceId}/pages/{pageId}/brand-kit : kit de marque (F2).
// Lecture : tout membre. Écriture : propriétaire ou éditeur, espace modifiable.
import { getBrandKit, putBrandKit } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { pageIdParam } from '../../../../../meta/params';
import { BrandKitSchema } from '../../../../../meta/schemas';

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: await getBrandKit(ctx, pageIdParam(params)),
}));

export const PUT = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: BrandKitSchema,
  },
  async (ctx, { body, params }) => ({
    status: 200,
    body: await putBrandKit(ctx, pageIdParam(params), body),
  }),
);
