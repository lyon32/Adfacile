// GET /api/v1/meta/callback : retour de la fenêtre Facebook. Toujours une redirection vers
// l'application (APPFLOW §6.1) ; sans session, 401. Le `state` est vérifié par le cas d'usage.
import { completeMetaConnect } from '@pubeka/core';
import { z } from 'zod';
import { api } from '../../../../../server/http/routes';
import { metaDeps } from '../meta-services';

const CallbackQuery = z.object({
  state: z.string().min(1).max(2048),
  code: z.string().max(2048).optional(),
  error: z.string().max(200).optional(),
  error_reason: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
});

export const GET = api(
  { auth: 'user', rateLimit: 'read', query: CallbackQuery },
  async (ctx, { query }) => {
    const result = await completeMetaConnect(
      ctx,
      { state: query.state, code: query.code, error: query.error },
      metaDeps(),
    );
    return { status: 302, location: result.location };
  },
);
