// PATCH et DELETE /api/v1/workspaces/{workspaceId}/members/{profileId} : changer le rôle,
// retirer (propriétaire, espace modifiable ; SECURITY_NOTES §2.2, EC-TEAM-04, EC-TEAM-05).
import { changeMemberRole, removeMember } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { ChangeMemberRoleSchema, profileIdParam } from '../../../schemas';

export const PATCH = api(
  {
    auth: 'member',
    roles: ['owner'],
    writable: true,
    rateLimit: 'write',
    body: ChangeMemberRoleSchema,
  },
  async (ctx, { body, params }) => ({
    status: 200,
    body: await changeMemberRole(ctx, profileIdParam(params), body.role),
  }),
);

export const DELETE = api(
  { auth: 'member', roles: ['owner'], writable: true, rateLimit: 'write' },
  async (ctx, { params }) => {
    await removeMember(ctx, profileIdParam(params));
    return { status: 204 };
  },
);
