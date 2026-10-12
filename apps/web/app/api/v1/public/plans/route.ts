// GET /api/v1/public/plans : formules et prix (montants calculés par le serveur, en entiers).
import { listPlans } from '@pubeka/core';
import { api } from '../../../../../server/http/routes';

export const GET = api({ auth: 'none', rateLimit: 'public' }, async (ctx) => ({
  status: 200,
  body: { data: await listPlans(ctx) },
}));
