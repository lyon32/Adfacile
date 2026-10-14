// POST /api/v1/workspaces/{workspaceId}/meta/connect : l'adresse de la fenêtre Facebook, avec un
// `state` signé (propriétaire, espace modifiable ; SECURITY_NOTES §2.3).
import { startMetaConnect } from '@pubeka/core';
import { z } from 'zod';
import { api } from '../../../../../../../server/http/routes';
import { metaDeps } from '../../../../meta/meta-services';

const ConnectSchema = z.strictObject({ return_to: z.enum(['onboarding', 'settings']).optional() });

export const POST = api(
  {
    auth: 'member',
    roles: ['owner'],
    writable: true,
    rateLimit: 'write',
    body: ConnectSchema.optional(),
  },
  (ctx, { body }) =>
    Promise.resolve({
      status: 200,
      body: startMetaConnect(ctx, { return_to: body?.return_to }, metaDeps()),
    }),
);
