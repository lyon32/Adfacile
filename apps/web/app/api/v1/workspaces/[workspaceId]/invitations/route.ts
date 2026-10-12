// POST /api/v1/workspaces/{workspaceId}/invitations : inviter un membre par e-mail
// (propriétaire, espace modifiable, limite de membres de la formule ; EC-TEAM-01).
import { inviteMember } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { inviteDeps } from '../../../invitations/invitation-services';
import { InviteMemberSchema } from '../../schemas';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner'],
    writable: true,
    rateLimit: 'write',
    body: InviteMemberSchema,
  },
  async (ctx, { body }) => ({ status: 201, body: await inviteMember(ctx, body, inviteDeps()) }),
);
