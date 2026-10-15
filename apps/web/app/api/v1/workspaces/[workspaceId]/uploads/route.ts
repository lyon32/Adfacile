// POST /api/v1/workspaces/{workspaceId}/uploads : URL d'envoi signée (propriétaire ou éditeur).
import { createUploadTicket } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { uploadRequestSchema } from '../../../analysis/schemas';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: uploadRequestSchema,
  },
  async (ctx, { body }) => ({ status: 201, body: await createUploadTicket(ctx, body) }),
);
