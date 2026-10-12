// POST /api/v1/workspaces/{workspaceId}/transfer-ownership : le propriétaire transfère
// l'espace à un membre (EC-TEAM-06) ; connexion récente exigée (API_SPEC §2.2 règle 6).
import { transferOwnership } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { TransferOwnershipSchema } from '../../schemas';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner'],
    writable: true,
    rateLimit: 'write',
    body: TransferOwnershipSchema,
  },
  async (ctx, { body }) => ({ status: 200, body: await transferOwnership(ctx, body.profile_id) }),
);
