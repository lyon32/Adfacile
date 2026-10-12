// GET /api/v1/public/fx-rates : dernier taux USD → XAF / XOF connu.
import { listFxRates } from '@pubeka/core';
import { api } from '../../../../../server/http/routes';

export const GET = api({ auth: 'none', rateLimit: 'public' }, async (ctx) => ({
  status: 200,
  body: { data: await listFxRates(ctx) },
}));
