// POST /api/v1/workspaces/{workspaceId}/campaigns/pause-all : met en pause chez Meta TOUTES les publicités de l'espace (S19b, TR-PAY-07,
// EC-PAY-11). Propriétaire ou éditeur. Action ✱ comme la pause d'une campagne : `allowLocked`, sans `writable` (permise en grâce, verrouillé,
// lecture seule), jamais bloquée par `PUBEKA_META_PUBLISH`. `Idempotency-Key` obligatoire. Meta d'abord et confirmé : une campagne n'est
// marquée en pause que si Meta le confirme.
import { pauseAllCampaigns } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { emptyBodySchema } from '../../../../campaigns/schemas';
import { controlDeps } from '../../../../campaigns/services';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    allowLocked: true,
    rateLimit: 'write',
    idempotent: true,
    body: emptyBodySchema,
  },
  async (ctx) => ({ status: 200, body: await pauseAllCampaigns(ctx, controlDeps()) }),
);
