// GET et PATCH /api/v1/me : profil de l'utilisateur connecté.
// DELETE /me et POST /me/export arrivent avec « mes données » (S34).
import { getMe, updateMe } from '@pubeka/core';
import { api } from '../../../../server/http/routes';
import { MeUpdateSchema } from './schemas';

export const GET = api({ auth: 'user', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: await getMe(ctx),
}));

export const PATCH = api(
  { auth: 'user', rateLimit: 'write', body: MeUpdateSchema },
  async (ctx, { body }) => ({ status: 200, body: await updateMe(ctx, body) }),
);
