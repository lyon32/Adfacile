// GET /api/v1/public/maintenance : état du mode maintenance (répond même pendant la maintenance).
import { getMaintenance } from '@pubeka/core';
import { api } from '../../../../../server/http/routes';

export const GET = api(
  { auth: 'none', rateLimit: 'public', ignoreMaintenance: true },
  async (ctx) => ({ status: 200, body: await getMaintenance(ctx) }),
);
