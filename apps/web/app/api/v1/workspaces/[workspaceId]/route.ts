// GET et PATCH /api/v1/workspaces/{workspaceId} : détail (tout membre), renommer (propriétaire).
import { getWorkspace, renameWorkspace } from '@pubeka/core';
import { api } from '../../../../../server/http/routes';
import { RenameWorkspaceSchema } from '../schemas';

// `allowLocked` : l'écran de verrouillage (« Choisis une formule » / « Renouvelle ») a besoin de l'état de l'espace.
export const GET = api({ auth: 'member', allowLocked: true, rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: await getWorkspace(ctx),
}));

export const PATCH = api(
  {
    auth: 'member',
    roles: ['owner'],
    writable: true,
    rateLimit: 'write',
    body: RenameWorkspaceSchema,
  },
  async (ctx, { body }) => ({ status: 200, body: await renameWorkspace(ctx, body.name) }),
);
