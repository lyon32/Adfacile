// POST /api/v1/workspaces/{workspaceId}/campaigns/pause-all : met en pause chez Meta TOUTES les publicités de l'espace (S19b, TR-PAY-07,
// EC-PAY-11). Propriétaire ou éditeur. Action ✱ comme la pause d'une campagne : `allowLocked`, sans `writable` (permise en grâce, verrouillé,
// lecture seule), jamais bloquée par `PUBEKA_META_PUBLISH`. `Idempotency-Key` obligatoire. Meta d'abord et confirmé : une campagne n'est
// marquée en pause que si Meta le confirme.
import { pauseAllCampaigns } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { emptyBodySchema } from '../../../../campaigns/schemas';
import { controlDeps } from '../../../../campaigns/services';

/**
 * Délai maximal (secondes ; la plateforme coupe au-delà). Un lot est de 10 campagnes au plus (`ACTION_BATCH`) ; chacune coûte quelques appels
 * à Meta (ordre, relecture), de l'ordre de la seconde : 120 s laissent une large marge, comme la génération des propositions. Au-delà de 10
 * campagnes, la réponse dit `more: true` et le client clique encore (rejouable : ce qui est fait n'est jamais refait).
 */
export const maxDuration = 120;

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
